import unittest
from audio_features import separate, process, verified_models
import tempfile
import json
import hashlib
import wave
from pathlib import Path

class AudioTests(unittest.TestCase):
    def test_sung_lyrics_are_not_spoken_or_licensed(self):
        result=separate([{'start':0,'end':1,'text':'fixture lyric'}],[{'start':0,'end':1,'speech':.1,'music':.9,'singing':.9}],1)
        self.assertEqual(result['spokenTranscript'],[])
        self.assertEqual(len(result['musicLyricCandidates']),1)
        self.assertIsNone(result['has_licensed_music_lyrics'])
        self.assertEqual(result['audio_type'],'music-only')
    def test_mixed_speech_and_music_preserves_uncertainty(self):
        segment={'start':0,'end':1,'text':'fixture words'}
        mixed=separate([segment],[{'start':0,'end':1,'speech':.8,'music':.7,'singing':.6}],1)
        self.assertEqual(mixed['spokenTranscript'],[])
        self.assertEqual(mixed['unassignedTranscript'],[segment])
        self.assertIn('speech_music_ambiguous',mixed['qualityFlags'])
        clean=separate([segment],[{'start':0,'end':1,'speech':.9,'music':.5,'singing':.01}],1)
        self.assertEqual(clean['spokenTranscript'],[segment])
        self.assertEqual(clean['audio_type'],'unsure','audio cannot establish on-camera delivery')
    def test_bad_timing_and_oversized_outputs_fail(self):
        with self.assertRaises(ValueError): separate([{'start':-1,'end':1,'text':'x'}],[],1)
        with self.assertRaises(ValueError): separate([{}]*513,[],1)
    def test_missing_track_is_distinct_from_missing_or_failed_audio(self):
        with tempfile.TemporaryDirectory() as folder:
            key='a'*64; path=Path(folder)/key;path.mkdir()
            (path/'manifest.json').write_text(json.dumps({'cacheKey':key,'audioAvailable':False}))
            self.assertEqual(process(folder,key,'unused')['audio_type'],'silent')
            (path/'manifest.json').write_text(json.dumps({'cacheKey':key,'audioAvailable':True,'files':[]}))
            with self.assertRaises(StopIteration): process(folder,key,'unused')
    def test_real_pcm_pipeline_keeps_lyrics_separate_and_records_measured_usage(self):
        with tempfile.TemporaryDirectory() as folder:
            key='b'*64; path=Path(folder)/key;path.mkdir()
            audio=path/'audio.wav'
            with wave.open(str(audio),'wb') as wav:
                wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(16000);wav.writeframes(b'\x01\x00'*16000)
            record={'name':'audio.wav','sha256':hashlib.sha256(audio.read_bytes()).hexdigest(),'bytes':audio.stat().st_size}
            (path/'manifest.json').write_text(json.dumps({'cacheKey':key,'audioAvailable':True,'files':[record]}))
            class FixtureBackend:
                revision='fixture-not-a-real-model'
                def analyse(self,samples,duration):
                    return [{'start':0,'end':1,'text':'fixture song'}],[{'start':0,'end':1,'speech':.01,'music':.9,'singing':.8}]
            result=process(folder,key,'unused',FixtureBackend())
            self.assertGreater(result['peakRssKiB'],0)
            saved=json.loads((path/'audio-features.json').read_text())
            self.assertEqual(saved['spokenTranscript'],[])
            self.assertEqual(saved['musicLyricCandidates'][0]['text'],'fixture song')
            self.assertEqual(saved['audioSha256'],record['sha256'])
            self.assertFalse(list(path.glob('*.partial')))

    def test_unconfigured_model_pack_fails_without_download(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaises(FileNotFoundError): verified_models(folder)

if __name__=='__main__':unittest.main()
