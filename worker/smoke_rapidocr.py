"""Explicit local/CI smoke with the pinned package's bundled OCR assets, no face/product claims."""
import tempfile
from pathlib import Path
import shutil
import cv2
import numpy as np
import rapidocr_onnxruntime
from visual_features import LocalRapidOCR
with tempfile.TemporaryDirectory() as folder:
    root=Path(folder)
    candidates=list((Path(rapidocr_onnxruntime.__file__).parent/'models').glob('*.onnx'))
    for kind in ('det','cls','rec'):
        model=next(p for p in candidates if f'_{kind}_' in p.name)
        shutil.copyfile(model,root/f'ocr-{kind}.onnx')
    image=np.full((160,640,3),255,np.uint8)
    cv2.putText(image,'SAVE 20%',(35,105),cv2.FONT_HERSHEY_SIMPLEX,2.3,(0,0,0),4)
    result=LocalRapidOCR(root)(image)
    combined=' '.join(row['text'].upper() for row in result)
    print('Synthetic fixture OCR:',repr(combined))
    assert 'SAVE' in combined and '20' in combined, 'Real OCR fixture not recognised'
    print('Real RapidOCR synthetic text smoke passed; detector/labelled-set validation is separate.')
