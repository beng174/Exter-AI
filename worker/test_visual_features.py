import unittest
from pathlib import Path
import tempfile
import json
import numpy as np
from visual_features import collect_observations, process, prepare_image, verified_pack, checked_box

class Backend:
    revision='fixture-not-real-models'
    def analyse(self,image):
        return {'ocr':[{'text':'  SAVE 20% ','score':.8,'box':[0,0,20,10]}],
                'faces':[{'score':.95,'box':[0,0,20,20],'identity':'MUST_NOT_PERSIST'}],
                'products':[{'className':'bottle','score':.7,'box':[10,0,20,20],'brand':'MUST_NOT_PERSIST'}]}

class VisualTests(unittest.TestCase):
    def test_deduplication_preserves_observation_times_without_continuous_spans(self):
        result=collect_observations([{'path':'fixture','time':.5},{'path':'fixture','time':9}],Backend(),lambda _:np.zeros((40,60,3),np.uint8))
        self.assertEqual(len(result['onScreenText']),1)
        self.assertEqual([x['timestampSeconds'] for x in result['onScreenText'][0]['observations']],[.5,9])
        serialized=json.dumps(result)
        self.assertNotIn('MUST_NOT_PERSIST',serialized)
        self.assertNotIn('identity',serialized)
        self.assertFalse(result['frameObservations'][0]['productCandidates'][0]['verifiedProductIdentity'])
    def test_still_image_is_untimed_and_full_frame_pipeline_is_integrity_checked(self):
        import cv2
        with tempfile.TemporaryDirectory() as folder:
            image=Path(folder)/'source.png';cv2.imwrite(str(image),np.zeros((40,60,3),np.uint8))
            from extract_scenes import digest
            root=Path(folder)/'cache'; key=prepare_image(image,root,'workspace',digest(image))
            self.assertEqual(prepare_image(image,root,'workspace',digest(image)),key)
            result=process(root,key,'unused',Backend())
            saved=json.loads((root/key/'visual-features.json').read_text())
            self.assertIsNone(saved['onScreenText'][0]['observations'][0]['timestampSeconds'])
            self.assertEqual(saved['coverage'],'single-image')
            self.assertEqual(result['sampledFrameCount'],1)
            self.assertGreater(result['peakRssKiB'],0)
            (root/key/'frame-0.jpg').write_bytes(b'corrupt')
            with self.assertRaises(ValueError):process(root,key,'unused',Backend())
            self.assertFalse(list((root/key).glob('*.partial')))
    def test_empty_model_results_are_only_negative_for_observed_frames(self):
        class Empty:
            def analyse(self,_):return {'ocr':[],'faces':[],'products':[]}
        result=collect_observations([{'path':'f','time':1}],Empty(),lambda _:np.zeros((40,60,3),np.uint8))
        self.assertEqual(result['frameObservations'][0]['faceCount'],0)
        self.assertEqual(result['onScreenText'],[])
    def test_invalid_boxes_and_oversized_evidence_rejected(self):
        for box in ([float('nan'),0,1,1],[100,100,1,1],[0,0,-1,1]):
            with self.assertRaises(ValueError):checked_box(box,40,60)
        class Huge:
            def analyse(self,_):return {'ocr':[{}]*129,'faces':[],'products':[]}
        with self.assertRaises(ValueError):collect_observations([{'path':'f','time':1}],Huge(),lambda _:np.zeros((40,60,3),np.uint8))
    def test_missing_pack_never_loads_or_downloads_models(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaises(FileNotFoundError):verified_pack(folder)

if __name__=='__main__':unittest.main()
