"""Offline audio evidence. Model outputs are uncalibrated; uncertain words stay unassigned."""
import argparse
import csv
import hashlib
import importlib.metadata
import json
from pathlib import Path
import resource
import signal
import time
import wave
import uuid
import fcntl
import os
from extract_scenes import digest, safe_root

VERSION = "exter-audio-v1"

def separate(segments, windows, duration):
    if len(segments) > 512 or len(windows) > 1300:
        raise ValueError("Audio evidence exceeds bounds")
    speech, lyrics, unassigned = [], [], []
    for segment in segments:
        start, end, text = segment['start'], segment['end'], segment['text']
        if not 0 <= start < end <= duration+.1 or not isinstance(text,str) or len(text)>2000:
            raise ValueError("Invalid transcript evidence")
        relevant = [w for w in windows if w['start'] < end and w['end'] > start]
        voiced = max((w['speech'] for w in relevant), default=0)
        sung = max((w['singing'] for w in relevant), default=0)
        target = speech if voiced >= .5 and sung < .3 else lyrics if sung >= .3 and voiced < .5 else unassigned
        target.append(segment)
    music = any(w['music'] >= .3 or w['singing'] >= .3 for w in windows)
    return {'spokenTranscript': speech, 'musicLyricCandidates': lyrics, 'unassignedTranscript': unassigned,
            'audioContent': 'speech-and-music' if speech and music else 'speech' if speech else 'music' if music else 'unknown',
            'audio_type': 'music-only' if music and not speech and not unassigned else 'unsure',
            'has_licensed_music_lyrics': None, 'qualityFlags': ['audio_policy_uncalibrated'] + (['speech_music_ambiguous'] if unassigned else []) + (['asr_no_speech_segments'] if not segments and any(w['speech']>=.5 for w in windows) else [])}

def verified_models(root):
    root = safe_root(root)
    manifest_path = root/'manifest.json'
    if manifest_path.is_symlink() or manifest_path.stat().st_size>65536:
        raise ValueError("Invalid model manifest")
    manifest = json.loads(manifest_path.read_text())
    if set(manifest['models']) != {'whisper','yamnet'}:
        raise ValueError("Both local models required")
    if any(p.is_symlink() for p in root.rglob('*')):
        raise ValueError('Symlink in model pack')
    declared = manifest['files']
    required = {'whisper/model.bin','whisper/tokenizer.json','whisper/config.json','yamnet/saved_model.pb','yamnet/assets/yamnet_class_map.csv'}
    if not required.issubset(declared):
        raise ValueError('Incomplete model pack')
    actual = {str(p.relative_to(root)) for p in root.rglob('*') if p.is_file() and p != manifest_path}
    if set(declared) != actual or not 1 <= len(actual) <= 100:
        raise ValueError("Model file inventory mismatch")
    for name, sha in declared.items():
        p = root/name
        if p.is_symlink() or any(parent.is_symlink() for parent in p.parents) or not p.resolve().is_relative_to(root) or digest(p) != sha:
            raise ValueError("Model hash mismatch")
    for model in manifest['models'].values():
        if not model.get('revision') or not model.get('source') or not model.get('licence'):
            raise ValueError("Model provenance required")
    return manifest, hashlib.sha256(json.dumps(manifest,sort_keys=True).encode()).hexdigest()

class LocalModels:
    def __init__(self, root):
        self.manifest, self.revision = verified_models(root)
        for name, version in [('faster-whisper','1.2.1'),('tensorflow-cpu','2.20.0')]:
            if importlib.metadata.version(name) != version:
                raise ValueError("Unexpected audio dependency version")
        import tensorflow as tf
        tf.config.threading.set_inter_op_parallelism_threads(1)
        tf.config.threading.set_intra_op_parallelism_threads(1)
        from faster_whisper import WhisperModel
        self.whisper = WhisperModel(str(Path(root)/'whisper'), device='cpu', compute_type='int8', cpu_threads=1, num_workers=1, local_files_only=True)
        self.yamnet = tf.saved_model.load(str(Path(root)/'yamnet'))
        with (Path(root)/'yamnet/assets/yamnet_class_map.csv').open() as stream:
            rows = list(csv.DictReader(stream))
        if len(rows)!=521 or [int(r['index']) for r in rows]!=list(range(521)):
            raise ValueError("Invalid YAMNet classes")
        self.classes = [r['display_name'] for r in rows]
    def analyse(self, samples, duration):
        import numpy as np
        # Bounded chunks avoid loading a ten-minute spectrogram at once.
        windows = []
        for offset in range(0,len(samples),16000*20):
            chunk = samples[offset:offset+16000*20]
            scores, _, _ = self.yamnet(np.pad(chunk,(0,max(0,15600-len(chunk)))))
            for index, row in enumerate(scores.numpy()):
                start = offset/16000 + index*.48
                if start >= duration: break
                score = lambda names: max((float(row[self.classes.index(n)]) for n in names if n in self.classes),default=0)
                windows.append({'start':start,'end':min(duration,start+.96), 'speech':score(['Speech','Conversation','Narration, monologue']), 'music':score(['Music']), 'singing':score(['Singing','Rapping'])})
        segments, _ = self.whisper.transcribe(samples, beam_size=1, temperature=0, condition_on_previous_text=False, vad_filter=False)
        transcript = []
        for s in segments:
            if len(transcript)>=512: raise ValueError("Too many speech segments")
            if s.text.strip(): transcript.append({'start':s.start,'end':s.end,'text':s.text.strip()})
        return transcript, windows

def process(scene_root, scene_key, model_root, backend=None):
    if len(scene_key)!=64 or any(c not in '0123456789abcdef' for c in scene_key):
        raise ValueError("Invalid scene key")
    root = safe_root(scene_root)
    with (root/'.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        directory = root/scene_key
        if directory.is_symlink(): raise ValueError("Invalid scene cache")
        manifest_path = directory/'manifest.json'
        if manifest_path.is_symlink() or manifest_path.stat().st_size>65536: raise ValueError("Invalid scene manifest")
        scene = json.loads(manifest_path.read_text())
        if scene['cacheKey']!=scene_key: raise ValueError("Scene identity mismatch")
        started = time.monotonic()
        if not scene['audioAvailable']:
            return {'stage':'audio-ready','audio_type':'silent','reason':'verified-source-has-no-audio-track','modelsRevision':None,'processingSeconds':time.monotonic()-started,'peakRssKiB':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,'qualityFlags':[], 'has_licensed_music_lyrics':None}
        record = next(f for f in scene['files'] if f['name']=='audio.wav')
        audio = directory/'audio.wav'
        if audio.stat().st_size!=record['bytes'] or digest(audio)!=record['sha256']: raise ValueError("Audio integrity failure")
        import numpy as np
        with wave.open(str(audio),'rb') as wav:
            if (wav.getnchannels(),wav.getsampwidth(),wav.getframerate())!=(1,2,16000) or not 0<wav.getnframes()<=16000*600:
                raise ValueError("Invalid audio encoding")
            samples = np.frombuffer(wav.readframes(wav.getnframes()),dtype='<i2').astype(np.float32)/32768
        duration = len(samples)/16000
        # Only digital zero establishes silence without a classifier.
        if not np.any(samples):
            return {'stage':'audio-ready','audio_type':'silent','reason':'verified-digital-silence','modelsRevision':None,'processingSeconds':time.monotonic()-started,'peakRssKiB':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,'qualityFlags':[], 'has_licensed_music_lyrics':None}
        models = backend or LocalModels(model_root)
        segments, windows = models.analyse(samples,duration)
        if not windows or any(not 0<=w['start']<w['end']<=duration+.1 or any(not 0<=w[k]<=1 for k in ('speech','music','singing')) for w in windows):
            raise ValueError("Invalid classifier output")
        result = {**separate(segments,windows,duration), 'stage':'audio-ready','version':VERSION, 'modelsRevision':models.revision, 'sceneCacheKey':scene_key, 'audioSha256':record['sha256'],
                  'durationSeconds':duration, 'windows':windows, 'processingSeconds':time.monotonic()-started,
                  'peakRssKiB':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss}
        data = json.dumps(result)
        if len(data)>2*1024**2: raise ValueError("Audio result too large")
        temporary = directory/('.audio-'+uuid.uuid4().hex+'.partial')
        try:
            with temporary.open('x') as f: f.write(data); f.flush(); os.fsync(f.fileno())
            os.replace(temporary,directory/'audio-features.json')
        finally: temporary.unlink(missing_ok=True)
        return {k:result[k] for k in ('stage','version','modelsRevision','durationSeconds','processingSeconds','peakRssKiB','qualityFlags','audio_type')}

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    for name in ('scene-root','scene-key','models'): parser.add_argument('--'+name,required=True)
    args=parser.parse_args()
    def interrupted(*_): raise InterruptedError('Cancelled')
    signal.signal(signal.SIGTERM,interrupted)
    try: print(json.dumps(process(args.scene_root,args.scene_key,args.models)))
    except Exception:
        print(json.dumps({'error':'Audio extraction unavailable; verify retained audio, pinned local models and worker capacity.'}))
        raise SystemExit(1)
