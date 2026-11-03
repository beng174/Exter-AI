# Offline audio model contract

Implementation status: adapters and policy fixtures, not model-quality or Render
capacity sign-off. No model weights are bundled or automatically downloaded.

Candidate speech model: a CTranslate2 conversion of multilingual Whisper base,
CPU int8, one thread. Candidate classifier: Google YAMNet SavedModel version 1
(the TensorFlow Hub export, not a Keras H5 file). The current worker runtime pins
faster-whisper 1.2.1 and tensorflow-cpu 2.20.0. The SavedModel API avoids the
Keras 2/3 H5 loading incompatibility documented by upstream.

Sources checked 3 November 2026:
- https://github.com/SYSTRAN/faster-whisper
- https://www.tensorflow.org/hub/tutorials/yamnet
- https://github.com/tensorflow/models/tree/master/research/audioset/yamnet
- https://github.com/openai/whisper (code/weights MIT)
- https://github.com/tensorflow/models/blob/master/LICENSE (code Apache-2.0)

Review the actual downloaded model's own licence and source revision before
production. Code licences alone do not establish rights to every model asset.
A model pack must have `whisper/` containing local CTranslate2 weights and tokenizer,
`yamnet/` containing a local SavedModel and `assets/yamnet_class_map.csv`, and a
`manifest.json` with `models` and `files`. `models` must contain exactly `whisper`
and `yamnet`, each with nonempty `revision`, `source` and `licence`. `files` maps
every relative file in the pack, except manifest.json, to its SHA-256. Missing,
extra, modified and symlink files fail verification. Populate actual verified
hashes and immutable source revisions when installing; no placeholder pack is
accepted. A full model inference and quality benchmark is still required.

The process runs offline; Whisper uses local_files_only and no hub loader is
called. Provider credentials are omitted from the Python subprocess environment.
Stage outputs retain word candidates, timing, model revision, quality flags,
processing duration and process peak RSS. Whisper segment times and YAMNet
0.96-second windows at 0.48-second hops share the source audio clock.

Provisional policy thresholds are explicitly uncalibrated. Song candidates stay
outside spokenTranscript. Simultaneous singing/speech or unsupported words stay
in unassignedTranscript, not deleted. Speech alone cannot establish voiceover vs
on-camera delivery. Licensing stays null. Missing/failed decoding is an error;
only a verified absent track or all-zero decoded PCM establishes silence here.

Fixtures use supplied classifier scores and transcripts, not actual model
predictions. Before enabling on Render, install/review the real pack, run it on
the labelled speech/music set (including Valentte lyric mistakes), calibrate
thresholds, and measure peak RSS with both models loaded. Do not assume the
512MB service is sufficient. Full audio features stay on the worker; the job
stores only a small summary. Audio outputs currently recompute on a repeated
explicit audio job; paid-result caching is a later K06 requirement.
