# Visual evidence worker

Status: implemented adapters and policy fixtures; real RapidOCR synthetic-text
smoke tested. Full model-pack, face/product quality, labelled-ad evaluation and
Render capacity validation are still pending. Keep production visual work off.

Runtime: rapidocr-onnxruntime 1.4.4, onnxruntime 1.20.1 and the existing pinned
headless OpenCV scene runtime. Install requirements-visual-runtime.txt normally,
then requirements-visual.txt with --no-deps. This deliberately avoids RapidOCR's
GUI opencv-python dependency. The required transitive packages are explicitly
listed in the runtime file. Do not install these in the web service.

The reviewed offline pack contains manifest.json and these required files:
- ocr-det.onnx, ocr-rec.onnx, ocr-cls.onnx: compatible RapidOCR/PaddleOCR exports.
- face.onnx: OpenCV Zoo YuNet face detector; no face recognition or embeddings.
- product.onnx: YOLOX COCO-80 export with decoded cx/cy/w/h output, 640px input,
  output shape [1,8400,85]. Raw grid logits and other exports are rejected.
- classes.json: the exact 80 class names in the model output order.

manifest.json requires models={ocr,face,product}, with revision/source/licence for
each, productOutput="decoded-cxcywh-640", and files mapping every relative model
file (except manifest.json) to its actual SHA-256. No missing/extra/symlink files
are accepted. Supply genuine immutable revisions and verified hashes after
reviewing the downloaded assets; placeholders are not a production model pack.
No runtime model download or remote model loader exists.

Sources checked 3 November 2026:
- https://github.com/RapidAI/RapidOCR
- Pinned PyPI 1.4.4 wheel API inspected for explicit local model paths and threads.
- https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet
  (its published directory licence is MIT).
- https://github.com/Megvii-BaseDetection/YOLOX (code licence Apache-2.0).
Review the exact OCR/exported weights' own licences and notices too. Repository
code licences do not automatically establish rights to every downloaded asset.

Only verified sampled frames are processed. Repeated OCR is deduplicated by
case-folded whitespace while retaining original text and each observed frame's
box/time. These observations do not establish continuous display between frames.
Still images and carousel slides use null timestamps, not invented durations.
Face evidence contains counts and normalised boxes only, no identity/demographics.
Generic object candidates are not evidence of a verified product or brand, or of
who created an ad. Zero detections applies to sampled frames only. Decode/model
failure is an unavailable stage, never a fabricated negative.

Model scores and candidate thresholds are uncalibrated. Results carry explicit
quality flags. Full evidence stays in the worker cache; jobs return small counts,
cache/model revisions, processing duration and measured process peak RSS.

worker/smoke_rapidocr.py explicitly tests real OCR on generated SAVE 20% text,
using the pinned package's bundled assets. It does not validate the complete
production model pack or face/product accuracy. Those require reviewed assets,
annotated image/video fixtures, false-positive checks, and a Render peak-RSS and
restart benchmark before enabling the worker stage.
