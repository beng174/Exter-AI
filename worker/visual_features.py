"""Worker-only sampled visual evidence. Presence never establishes identity."""
import argparse
import fcntl
import hashlib
import importlib.metadata
import json
import math
import os
from pathlib import Path
import resource
import shutil
import tempfile
import signal
import time
import uuid
from extract_scenes import digest, safe_root

VERSION = 'exter-visual-v1'
REQUIRED = {'ocr-det.onnx','ocr-rec.onnx','ocr-cls.onnx','face.onnx','product.onnx','classes.json'}

def verified_pack(folder):
    root = safe_root(folder)
    manifest = root/'manifest.json'
    if manifest.is_symlink() or manifest.stat().st_size > 65536: raise ValueError('Invalid visual manifest')
    data = json.loads(manifest.read_text())
    if set(data['models']) != {'ocr','face','product'} or data.get('productOutput')!='decoded-cxcywh-640':
        raise ValueError('Unsupported visual pack')
    entries = list(root.rglob('*'))
    if any(p.is_symlink() for p in entries): raise ValueError('Symlink in model pack')
    actual = {str(p.relative_to(root)) for p in entries if p.is_file() and p!=manifest}
    if set(data['files'])!=actual or not REQUIRED.issubset(actual) or len(actual)>100: raise ValueError('Model inventory mismatch')
    for name,sha in data['files'].items():
        path = root/name
        if not path.resolve().is_relative_to(root) or digest(path)!=sha: raise ValueError('Model hash mismatch')
    for model in data['models'].values():
        if not all(model.get(k) for k in ('revision','source','licence')): raise ValueError('Model provenance required')
    return root, hashlib.sha256(json.dumps(data,sort_keys=True).encode()).hexdigest()

def checked_box(box,width,height):
    if len(box)!=4 or any(not isinstance(v,(int,float)) or not math.isfinite(v) for v in box): raise ValueError('Invalid box')
    x,y,w,h=box
    if w<=0 or h<=0 or x+w<=0 or y+h<=0 or x>=width or y>=height: raise ValueError('Box outside image')
    left,top=max(0,x),max(0,y)
    return [left/width,top/height,(min(width,x+w)-left)/width,(min(height,y+h)-top)/height]

class LocalRapidOCR:
    def __init__(self,root):
        if importlib.metadata.version('rapidocr-onnxruntime')!='1.4.4' or importlib.metadata.version('onnxruntime')!='1.20.1':
            raise ValueError('Unexpected visual runtime')
        from rapidocr_onnxruntime import RapidOCR
        self.engine=RapidOCR(det_model_path=str(root/'ocr-det.onnx'),rec_model_path=str(root/'ocr-rec.onnx'),cls_model_path=str(root/'ocr-cls.onnx'),intra_op_num_threads=1,inter_op_num_threads=1,text_score=0.0)
    def __call__(self,image):
        rows,_=self.engine(image,text_score=0.0)
        result=[]
        for polygon,text,score in rows or []:
            xs=[float(p[0]) for p in polygon];ys=[float(p[1]) for p in polygon]
            result.append({'text':text,'score':float(score),'box':[min(xs),min(ys),max(xs)-min(xs),max(ys)-min(ys)]})
        return result

class LocalModels:
    def __init__(self,folder):
        import cv2
        cv2.setNumThreads(1)
        root,self.revision=verified_pack(folder)
        self.ocr=LocalRapidOCR(root)
        self.face=cv2.FaceDetectorYN.create(str(root/'face.onnx'),'',(640,640),.9,.3,50)
        self.product=cv2.dnn.readNetFromONNX(str(root/'product.onnx'))
        self.product.setPreferableBackend(cv2.dnn.DNN_BACKEND_OPENCV)
        self.product.setPreferableTarget(cv2.dnn.DNN_TARGET_CPU)
        self.classes=json.loads((root/'classes.json').read_text())
        if len(self.classes)!=80 or any(not isinstance(c,str) or len(c)>100 for c in self.classes): raise ValueError('Expected COCO-80 vocabulary')
    def analyse(self,image):
        import cv2
        import numpy as np
        h,w=image.shape[:2]
        self.face.setInputSize((w,h));_,faces=self.face.detect(image)
        face_boxes=[{'box':[float(v) for v in row[:4]],'score':float(row[14])} for row in faces] if faces is not None else []
        # Contract: YOLOX ONNX export WITH decoded cx/cy/w/h output at 640px.
        ratio=min(640/w,640/h)
        padded=np.full((640,640,3),114,dtype=np.uint8)
        resized=cv2.resize(image,(int(w*ratio),int(h*ratio)))
        padded[:resized.shape[0],:resized.shape[1]]=resized
        self.product.setInput(cv2.dnn.blobFromImage(padded,1.0,(640,640),swapRB=False))
        output=self.product.forward()
        if output.shape!=(1,8400,85) or not np.isfinite(output).all(): raise ValueError('Unsupported product export')
        boxes=[];scores=[];classes=[]
        for row in output[0]:
            category=int(np.argmax(row[5:]));score=float(row[4]*row[5+category])
            if score<.5: continue
            cx,cy,bw,bh=[float(v) for v in row[:4]]
            boxes.append([(cx-bw/2)/ratio,(cy-bh/2)/ratio,bw/ratio,bh/ratio]);scores.append(score);classes.append(category)
        products=[]
        for category in set(classes):
            subset=[i for i,c in enumerate(classes) if c==category]
            indices=cv2.dnn.NMSBoxes([boxes[i] for i in subset],[scores[i] for i in subset],.5,.45)
            for index in np.asarray(indices).reshape(-1):
                i=subset[int(index)]
                if self.classes[category]=='person': continue
                if len(products)>=40: raise ValueError('Too many visual candidates')
                products.append({'className':self.classes[category],'box':boxes[i],'score':scores[i]})
        return {'ocr':self.ocr(image),'faces':face_boxes,'products':products}

def collect_observations(frames,backend,decode):
    texts={};observations=[]
    for index,frame in enumerate(frames):
        image=decode(frame['path'])
        if image is None or image.shape[0]*image.shape[1]>40_000_000: raise ValueError('Invalid sampled image')
        h,w=image.shape[:2];rows=backend.analyse(image)
        if set(rows)!={'ocr','faces','products'} or any(len(rows[k])>128 for k in rows): raise ValueError('Oversized visual output')
        faces=[];products=[]
        for kind,target in [('faces',faces),('products',products)]:
            for item in rows[kind]:
                if not 0<=item['score']<=1: raise ValueError('Invalid model score')
                value={'bbox':checked_box(item['box'],w,h),'modelScore':item['score']}
                if kind=='products':
                    if not isinstance(item['className'],str) or len(item['className'])>100: raise ValueError('Invalid object class')
                    value.update(className=item['className'],verifiedProductIdentity=False)
                target.append(value)
        for item in rows['ocr']:
            text=item['text']
            if not isinstance(text,str) or len(text)>2000 or not 0<=item['score']<=1: raise ValueError('Invalid OCR output')
            normal=' '.join(text.split()).casefold()
            if not normal: continue
            observation={'frameIndex':index,'timestampSeconds':frame['time'],'bbox':checked_box(item['box'],w,h),'modelScore':item['score']}
            texts.setdefault(normal,{'text':text,'observations':[]})['observations'].append(observation)
        observations.append({'frameIndex':index,'timestampSeconds':frame['time'],'faceCount':len(faces),'faces':faces,'productCandidates':products})
    return {'onScreenText':list(texts.values()),'frameObservations':observations}

def process(root,key,models,backend=None,decode=None):
    if len(key)!=64 or any(c not in '0123456789abcdef' for c in key): raise ValueError('Invalid scene key')
    root=safe_root(root)
    with (root/'.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        directory=root/key
        if directory.is_symlink(): raise ValueError('Unsafe scene cache')
        manifest=directory/'manifest.json'
        if manifest.is_symlink() or manifest.stat().st_size>65536: raise ValueError('Invalid scene manifest')
        scene=json.loads(manifest.read_text())
        times=scene['sampleTimes']
        if scene['cacheKey']!=key or not 0<len(times)<=8 or (scene.get('mediaKind')=='image' and times!=[None]) or (scene.get('mediaKind')!='image' and any(not isinstance(t,(int,float)) or not 0<=t<scene['durationSeconds'] for t in times)): raise ValueError('Invalid source times')
        records={r['name']:r for r in scene['files']}
        frames=[]
        for i,t in enumerate(times):
            name=f'frame-{i}.jpg';path=directory/name;record=records[name]
            if path.stat().st_size>2*1024**2 or path.stat().st_size!=record['bytes'] or digest(path)!=record['sha256']: raise ValueError('Frame integrity failure')
            frames.append({'time':t,'path':str(path)})
        started=time.monotonic();engine=backend or LocalModels(models)
        if decode is None:
            import cv2
            decode=cv2.imread
        result={**collect_observations(frames,engine,decode),'version':VERSION,'sceneCacheKey':key,'modelsRevision':engine.revision,
                'coverage':'single-image' if scene.get('mediaKind')=='image' else 'sampled-frames-only','qualityFlags':['visual_scores_uncalibrated','generic_object_presence_not_product_identity'],
                'processingSeconds':time.monotonic()-started,'peakRssKiB':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss}
        # Measurement includes inference, not just model load.
        result['processingSeconds']=time.monotonic()-started
        data=json.dumps(result)
        if len(data)>2*1024**2: raise ValueError('Visual evidence exceeds bounds')
        temporary=directory/('.visual-'+uuid.uuid4().hex+'.partial')
        try:
            with temporary.open('x') as f:f.write(data);f.flush();os.fsync(f.fileno())
            os.replace(temporary,directory/'visual-features.json')
        finally:temporary.unlink(missing_ok=True)
        return {'stage':'visual-ready','version':VERSION,'sceneCacheKey':key,'modelsRevision':engine.revision,
                'sampledFrameCount':len(frames),'uniqueTextCount':len(result['onScreenText']),
                'processingSeconds':result['processingSeconds'],'peakRssKiB':result['peakRssKiB'],'qualityFlags':result['qualityFlags']}

def prepare_image(source,root,workspace,sha):
    import cv2
    if not workspace or len(workspace)>200:raise ValueError('Invalid workspace')
    source=Path(source);root=safe_root(root)
    if source.stat().st_size>25*1024**2 or digest(source)!=sha:raise ValueError('Image integrity failure')
    key=hashlib.sha256(json.dumps([workspace,sha,VERSION,cv2.__version__,'image-640']).encode()).hexdigest()
    with (root/'.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        target=root/key
        if target.is_symlink():raise ValueError('Unsafe image cache')
        if target.exists():return key  # process() independently verifies the manifest/frame.
        if sum(p.stat().st_size for p in root.rglob('*') if p.is_file())+8*1024**2>2*1024**3 or shutil.disk_usage(root).free<264*1024**2:
            raise ValueError('Cache capacity reached')
        image=cv2.imread(str(source))
        if image is None or image.shape[0]*image.shape[1]>40_000_000:raise ValueError('Invalid image')
        h,w=image.shape[:2];ratio=min(1,640/max(h,w));image=cv2.resize(image,(max(1,int(w*ratio)),max(1,int(h*ratio))))
        temporary=Path(tempfile.mkdtemp(prefix='.partial-',dir=root))
        try:
            frame=temporary/'frame-0.jpg'
            if not cv2.imwrite(str(frame),image) or frame.stat().st_size>2*1024**2:raise ValueError('Invalid image encoding')
            manifest={'cacheKey':key,'sourceSha256':sha,'mediaKind':'image','durationSeconds':None,'sampleTimes':[None],
                      'files':[{'name':'frame-0.jpg','bytes':frame.stat().st_size,'sha256':digest(frame)}]}
            (temporary/'manifest.json').write_text(json.dumps(manifest));os.rename(temporary,target)
        finally:
            if temporary.exists():shutil.rmtree(temporary)
    return key

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    for name in ('scene-root','models'):parser.add_argument('--'+name,required=True)
    for name in ('scene-key','source','workspace','sha256'):parser.add_argument('--'+name)
    args=parser.parse_args()
    def interrupted(*_):raise InterruptedError('Cancelled')
    signal.signal(signal.SIGTERM,interrupted)
    try:
        key=args.scene_key or prepare_image(args.source,args.scene_root,args.workspace,args.sha256)
        print(json.dumps(process(args.scene_root,key,args.models)))
    except Exception:
        print(json.dumps({'error':'Visual extraction unavailable; verify frames, offline models and worker capacity.'}))
        raise SystemExit(1)
