"""Bounded offline video features; never runs inference or reads provider credentials."""
import argparse
import fcntl
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import tempfile
import time

VERSION = "exter-scenes-v1"
MAX_OUTPUT = 128 * 1024 * 1024

def digest(path):
    if path.is_symlink() or not path.is_file():
        raise ValueError("Unsafe artifact")
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def run(args):
    # No remote protocols, shell, or provider data in diagnostics.
    return subprocess.run(args, check=True, capture_output=True, timeout=180).stdout

def safe_root(root):
    root = Path(os.path.abspath(root))
    for parent in [*reversed(root.parents), root]:
        if parent.is_symlink():
            raise ValueError("Unsafe cache directory")
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    return root

def extract(source, root, workspace, expected, quota=2*1024**3, headroom=256*1024**2):
    source = Path(source)
    if source.stat().st_size > 250*1024**2 or digest(source) != expected:
        raise ValueError("Input integrity failure")
    if not workspace or len(workspace) > 200 or quota < MAX_OUTPUT or headroom < 0:
        raise ValueError("Invalid extraction configuration")
    root = safe_root(root)
    versions = {name: importlib.metadata.version(name) for name in ("scenedetect", "opencv-python-headless", "numpy")}
    versions["ffmpeg"] = run(["ffmpeg", "-version"]).decode().splitlines()[0]
    config = {"version": VERSION, "dependencies": versions, "width": 640, "fps": 12, "threshold": 27, "maxFrames": 8}
    key = hashlib.sha256(json.dumps([workspace, expected, config], sort_keys=True).encode()).hexdigest()
    with (root / ".lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        # A crash releases flock. Remove only our partial directories and expired entries.
        for entry in root.iterdir():
            if entry.is_symlink():
                raise ValueError("Unsafe cache entry")
            if entry.is_dir() and (entry.name.startswith(".partial-") or time.time()-entry.stat().st_mtime > 7*86400):
                shutil.rmtree(entry)
        target = root / key
        if target.exists():
            manifest_path = target / "manifest.json"
            if manifest_path.is_symlink() or manifest_path.stat().st_size > 65536:
                raise ValueError("Invalid manifest")
            manifest = json.loads(manifest_path.read_text())
            if manifest["cacheKey"] != key or manifest["sourceSha256"] != expected or manifest["config"] != config:
                raise ValueError("Invalid cache identity")
            for item in manifest["files"]:
                path = target / item["name"]
                if path.parent != target or path.stat().st_size != item["bytes"] or digest(path) != item["sha256"]:
                    raise ValueError("Corrupt cache")
            os.utime(target, None)
            return {**manifest, "cacheHit": True}
        used = sum(p.stat().st_size for p in root.rglob("*") if p.is_file())
        if used + MAX_OUTPUT > quota or shutil.disk_usage(root).free < headroom + MAX_OUTPUT:
            raise ValueError("Worker cache capacity reached")
        temporary = Path(tempfile.mkdtemp(prefix=".partial-", dir=root))
        try:
            probe = json.loads(run(["ffprobe", "-v", "error", "-protocol_whitelist", "file,pipe", "-show_format", "-show_streams", "-of", "json", str(source)]))
            duration = float(probe["format"]["duration"])
            videos = [s for s in probe["streams"] if s["codec_type"] == "video"]
            if not 0 < duration <= 600 or not videos or videos[0]["width"] * videos[0]["height"] > 40_000_000:
                raise ValueError("Unsupported duration or dimensions")
            audio = any(s["codec_type"] == "audio" for s in probe["streams"])
            normal = temporary / "normalised.mp4"
            run(["ffmpeg", "-nostdin", "-v", "error", "-threads", "1", "-protocol_whitelist", "file,pipe", "-i", str(source), "-map", "0:v:0", "-map", "0:a:0?", "-t", "600", "-vf", "scale=640:640:force_original_aspect_ratio=decrease:force_divisible_by=2,fps=12", "-filter_threads", "1", "-c:v", "libx264", "-threads", "1", "-preset", "veryfast", "-crf", "25", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "64k", "-fs", str(96*1024**2), str(normal)])
            verified = json.loads(run(["ffprobe", "-v", "error", "-show_format", "-of", "json", str(normal)]))
            if abs(float(verified["format"]["duration"])-duration) > .3:
                raise ValueError("Normalisation truncated media")
            import cv2
            cv2.setNumThreads(1)
            from scenedetect import open_video, SceneManager, ContentDetector
            video = open_video(str(normal))
            manager = SceneManager()
            manager.add_detector(ContentDetector(threshold=27, min_scene_len=6))
            manager.detect_scenes(video)
            scenes = [(a.get_seconds(), min(duration, b.get_seconds())) for a,b in manager.get_scene_list()]
            if not scenes:
                scenes = [(0, duration)]
            # Bound scene metadata and evenly cover cuts when there are more than eight.
            scenes = scenes[:1200]
            indices = sorted(set(round(i*(len(scenes)-1)/max(1,min(8,len(scenes))-1)) for i in range(min(8,len(scenes)))))
            anchors = {min(duration/2, .5), min(duration/2, 3), max(0, duration-.1)}
            candidates = sorted(set(min(duration-.001, (scenes[i][0]+scenes[i][1])/2) for i in indices) - anchors)
            remaining = 8-len(anchors)
            selected = [candidates[round(i*(len(candidates)-1)/max(1, min(remaining,len(candidates))-1))] for i in range(min(remaining,len(candidates)))]
            samples = sorted(anchors.union(selected))
            names = ["normalised.mp4"]
            for index, timestamp in enumerate(samples):
                name = f"frame-{index}.jpg"
                run(["ffmpeg", "-nostdin", "-v", "error", "-ss", str(timestamp), "-i", str(normal), "-frames:v", "1", "-threads", "1", "-q:v", "3", str(temporary/name)])
                names.append(name)
            if audio:
                run(["ffmpeg", "-nostdin", "-v", "error", "-i", str(normal), "-vn", "-t", "600", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(temporary/"audio.wav")])
                names.append("audio.wav")
            files = [{"name": name, "sha256": digest(temporary/name), "bytes": (temporary/name).stat().st_size} for name in names]
            if sum(f["bytes"] for f in files) > MAX_OUTPUT or any(f["bytes"] > 2*1024**2 for f in files if f["name"].endswith(".jpg")):
                raise ValueError("Feature artifacts exceed bounds")
            manifest = {"cacheKey": key, "sourceSha256": expected, "config": config, "durationSeconds": duration, "audioAvailable": audio, "scenes": scenes, "sampleTimes": samples, "files": files}
            (temporary/"manifest.json").write_text(json.dumps(manifest))
            os.rename(temporary, target)
            return {**manifest, "cacheHit": False}
        finally:
            if temporary.exists():
                shutil.rmtree(temporary)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    for name in ("source", "root", "workspace", "sha256"):
        parser.add_argument("--"+name, required=True)
    args = parser.parse_args()
    def interrupted(_signum, _frame):
        raise InterruptedError("Extraction cancelled")
    signal.signal(signal.SIGTERM, interrupted)
    try:
        print(json.dumps(extract(args.source, args.root, args.workspace, args.sha256)))
    except Exception:
        print(json.dumps({"error": "Worker scene extraction failed; check dependency, media integrity and cache capacity."}))
        raise SystemExit(1)
