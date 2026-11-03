import hashlib
import tempfile
import unittest
from pathlib import Path
from extract_scenes import extract, run, MAX_OUTPUT

class ExtractionTests(unittest.TestCase):
    def test_real_cuts_audio_cache_scope_corruption_and_bounds(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source = root/'source.mp4'
            run(['ffmpeg','-v','error','-f','lavfi','-i','color=red:s=64x48:r=12:d=1','-f','lavfi','-i','color=blue:s=64x48:r=12:d=1','-f','lavfi','-i','sine=frequency=440:duration=2','-filter_complex','[0:v][1:v]concat=n=2:v=1:a=0[v]','-map','[v]','-map','2:a','-c:v','libx264','-threads','1','-c:a','aac',str(source)])
            sha = hashlib.sha256(source.read_bytes()).hexdigest()
            cache = root/'cache'
            first = extract(source,cache,'one',sha)
            self.assertFalse(first['cacheHit'])
            self.assertTrue(first['audioAvailable'])
            self.assertGreaterEqual(len(first['scenes']),2)
            self.assertLessEqual(len(first['sampleTimes']),8)
            self.assertTrue(all(0<=t<2.1 for t in first['sampleTimes']))
            self.assertTrue(extract(source,cache,'one',sha)['cacheHit'])
            second = extract(source,cache,'two',sha)
            self.assertNotEqual(first['cacheKey'],second['cacheKey'])
            with self.assertRaises(ValueError): extract(source,cache,'one','0'*64)
            with self.assertRaises(ValueError): extract(source,root/'tiny','one',sha,quota=MAX_OUTPUT-1)
            with self.assertRaises(ValueError): extract(source,root/'full','one',sha,headroom=10**20)
            (cache/first['cacheKey']/'frame-0.jpg').write_bytes(b'corrupt')
            with self.assertRaises(ValueError): extract(source,cache,'one',sha)
            self.assertFalse(list(cache.glob('.partial-*')))

if __name__ == '__main__': unittest.main()
