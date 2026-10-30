# Evaluate native video analysis

Copy `video-labels.template.csv` and have a person label real stored ads before looking at model output. The template deliberately contains no invented labels. No accuracy is reported until you supply actual human labels. Use a held-out set to compare models fairly; do not use evaluation labels in prompts.

Use one row per real ad. `adId` must exactly match the saved analysis and be unique. `sourceUrl` is the original HTTPS ad source. Blank fields are unlabelled and excluded; use the literal `unknown` when a person cannot establish a value. Format labels are `UGC`, `founder-led`, `studio`, `animation`, `mixed`, or `unknown`. `personTalkingToCamera` uses `true`, `false`, or `unknown`.

**Strongly recommended:** fill `mediaSha256` with the SHA-256 hash of the exact locally stored video watched by the human labeller. All complete model predictions must carry a valid stored-video hash. Predictions for the same ad ID must use the same hash across configurations; if the CSV supplies a hash, every prediction must match it. An ad-library ID can represent changing or grouped creatives, so matching IDs alone is not sufficient evidence that two providers saw the same video. The evaluator rejects mismatched media rather than presenting an invalid comparison. The report shows how many human labels have explicit media hashes.

The other fields contain source-grounded text. For `keyClaims`, `spokenTranscript`, `onScreenText` and `creatorEvidence`, either enter text in chronological order or enter a JSON array of text strings. Creator evidence labels contain the actual visible handle or partnership-label text, not a guessed identity. Quote CSV fields containing commas, quotes or newlines using normal CSV escaping. Optional `<field>Timestamps` columns contain JSON arrays such as `[{"startSeconds":0,"endSeconds":3}]`, escaped as required by CSV. A timestamp column needs a non-blank corresponding value. Use seconds within the stored video, not the date an ad was posted.

Export predictions as `{ "predictions": [VideoAnalysisResult, ...] }`, using the platform's saved video results. An array of results or entries wrapped in `{ "adId": "actual-source-id", "analysis": ... }` is also accepted. An analysis has provider/model metadata (`provider`, `model`, `modelVersion`, `processingMode`, `promptVersion`) and a `fields` object with `{ "value": ..., "confidence": ..., "timestamps": [{ "startSeconds": ..., "endSeconds": ... }] }` annotations. The list fields contain arrays of annotations. `modelVersion: null` is preserved when the provider does not return an exact version; the report does not invent one. A separate `metadata` wrapper is also accepted. The evaluator reads saved outputs only; it never calls Gemini or TwelveLabs or uploads labels.

```sh
npm run video:evaluate -- \
  --labels /path/to/human-labels.csv \
  --predictions /path/to/gemini-predictions.json \
  --predictions /path/to/pegasus-predictions.json \
  --output /path/to/comparison.json
```

Every provider/model version/processing mode/prompt version/confidence threshold is scored separately against the same complete label set, identified by a SHA-256 digest. Missing ads and fields count as incorrect; they cannot improve accuracy through selective omission. Duplicate predictions for one ad/configuration fail explicitly. TwelveLabs stub results marked `status: "not_implemented"` are shown as unavailable with null accuracy, never as a real model benchmark. Fictional sample predictions are rejected.

Per field, the report shows exact-match accuracy, label count, answer coverage, abstentions and missing predictions. Exact match normalizes Unicode, letter case and whitespace. Free-text exact match is deliberately strict; token F1 supplies a lexical overlap measure and is **not** semantic accuracy. A semantically valid paraphrase can have a low lexical score and needs human review. Low-confidence outputs below the stored threshold (default 0.75) count as `unknown`. An explicit unknown human label may match an abstention, while answer coverage still records the abstention.

Timestamp accuracy is reported separately. An expected interval passes if a predicted interval has intersection-over-union of at least 0.5, or both interval boundaries are within 0.5 seconds. Unknown or missing intervals score zero. The report includes these thresholds and mean best IoU. Values are compared independently of timing, so inspect both measures.

Keep the label set fixed for a Gemini/Pegasus comparison. Review format confusion, unsupported creator attributions, transcript errors and low-coverage fields, rather than treating an overall average as proof that all concepts are reliable.
