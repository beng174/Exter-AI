import { createHash } from "node:crypto";
import { ANGLE_VALUES, AUDIO_TYPE_VALUES, CREATIVE_BOOLEAN_TAGS, CREATIVE_TAXONOMY_VERSION, FORMAT_VALUES, HOOK_TYPE_VALUES, OFFER_TYPE_VALUES } from "./creative-taxonomy.js";

export const VIDEO_EVALUATION_FIELDS = [
  "hook", "format", "angle", "keyClaims", "spokenTranscript",
  "onScreenText", "cta", "personTalkingToCamera", "creatorEvidence",
  "hook_type", "angle_explanation", "offer_type", "offer_explanation", "audio_type",
  "music_lyrics_present", "has_licensed_music_lyrics", ...CREATIVE_BOOLEAN_TAGS,
] as const;
export type EvaluationField = (typeof VIDEO_EVALUATION_FIELDS)[number];
export interface EvaluationTimestamp { startSeconds: number; endSeconds: number }
export interface HumanVideoLabel {
  adId: string;
  sourceUrl: string;
  mediaSha256?: string;
  taxonomyVersion?: string;
  fields: Partial<Record<EvaluationField, string>>;
  timestamps: Partial<Record<EvaluationField, EvaluationTimestamp[]>>;
}
export interface VideoEvaluationOptions {
  /** Explicit offline calibration experiment only; confidence is uncalibrated. Omit to score all evidence. */
  confidenceThreshold?: number;
  timestampToleranceSeconds?: number;
  timestampIouThreshold?: number;
}
interface EvaluatedValue { value: string; timestamps: EvaluationTimestamp[]; missing: boolean; abstained: boolean }
interface PredictionMetadata {
  provider: string;
  model: string;
  modelVersion: string | null;
  processingMode: string;
  promptVersion: string;
  requestedModel: string | null;
  servedModel: string | null;
  analysisConfigSha256: string | null;
  inferenceSettings: Record<string, unknown> | null;
  generation: Record<string, unknown> | null;
}
interface Prediction {
  adId: string;
  mediaSha256: string | null;
  metadata: PredictionMetadata;
  fields: Record<string, unknown>;
  unavailable: boolean;
}
export interface VideoFieldScore {
  labelled: number;
  exactMatches: number;
  accuracy: number | null;
  answered: number;
  coverage: number | null;
  abstentions: number;
  missingPredictions: number;
  textLabels: number;
  meanTokenF1: number | null;
  timestampLabels: number;
  timestampMatches: number;
  timestampAccuracy: number | null;
  meanTimestampIou: number | null;
}
const object = (value: unknown): Record<string, any> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : null;
const plain = (value: unknown) => typeof value === "string" ? value.trim() : "";

/** RFC 4180-style CSV with escaped quotes, embedded newlines, BOM and CRLF. */
export function parseVideoLabelCsv(csv: string): HumanVideoLabel[] {
  if (csv.length > 20 * 1024 * 1024) throw new Error("Label CSV exceeds 20 MB.");
  csv = csv.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false, afterQuote = false;
  function finishCell() { row.push(cell); cell = ""; afterQuote = false; }
  function finishRow() { finishCell(); if (row.some((v) => v.trim())) rows.push(row); row = []; }
  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    if (quoted) {
      if (char === '"') {
        if (csv[i + 1] === '"') { cell += '"'; i++; }
        else { quoted = false; afterQuote = true; }
      } else cell += char;
      continue;
    }
    if (afterQuote && char !== "," && char !== "\r" && char !== "\n")
      throw new Error("CSV has characters after a closing quote.");
    if (char === '"') {
      if (cell) throw new Error("CSV quotes must begin a field.");
      quoted = true;
    } else if (char === ",") finishCell();
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && csv[i + 1] === "\n") i++;
      finishRow();
    } else cell += char;
  }
  if (quoted) throw new Error("CSV contains an unterminated quoted field.");
  if (cell || afterQuote || row.length) finishRow();
  if (!rows.length) throw new Error("Label CSV needs a header and human-labelled real ads.");
  const header = rows.shift()!.map((v) => v.trim());
  if (new Set(header).size !== header.length) throw new Error("CSV headers must be unique.");
  if (!header.includes("adId") || !header.includes("sourceUrl"))
    throw new Error("CSV must include adId and sourceUrl columns.");
  const known = new Set<string>(["adId", "sourceUrl", "mediaSha256", "taxonomyVersion", "notes", "labelledBy", "labelledAt", ...VIDEO_EVALUATION_FIELDS, ...VIDEO_EVALUATION_FIELDS.map((v) => `${v}Timestamps`)]);
  if (header.some((name) => !known.has(name))) throw new Error("CSV contains an unsupported column; check field names.");
  const ids = new Set<string>();
  let labels = 0;
  const result = rows.map((values, index): HumanVideoLabel => {
    if (values.length !== header.length) throw new Error(`CSV row ${index + 2} does not match the header width.`);
    const record = Object.fromEntries(header.map((key, i) => [key, values[i].trim()]));
    const adId = record.adId;
    if (!adId || adId.length > 240 || ids.has(adId)) throw new Error("CSV ad IDs must be non-empty, bounded and unique.");
    ids.add(adId);
    let source: URL;
    try { source = new URL(record.sourceUrl); }
    catch { throw new Error(`CSV row ${index + 2} needs the original real-ad source URL.`); }
    if (source.protocol !== "https:" || source.username || source.password)
      throw new Error("Human labels require HTTPS real-ad source URLs without credentials.");
    const mediaSha256 = record.mediaSha256 || undefined;
    if (mediaSha256 !== undefined && !/^[a-f0-9]{64}$/i.test(mediaSha256))
      throw new Error("CSV mediaSha256 must be a complete 64-character hexadecimal stored-media hash.");
    const taxonomyVersion = record.taxonomyVersion || undefined;
    if (taxonomyVersion && taxonomyVersion !== CREATIVE_TAXONOMY_VERSION)
      throw new Error("CSV taxonomyVersion is unsupported; omit it for historical labels or use the current creative taxonomy.");
    const fields: HumanVideoLabel["fields"] = {}, timestamps: HumanVideoLabel["timestamps"] = {};
    for (const field of VIDEO_EVALUATION_FIELDS) {
      const value = record[field];
      if (value) { fields[field] = expectedText(value, field, taxonomyVersion); labels++; }
      if (record[`${field}Timestamps`]) {
        if (!value) throw new Error(`Timestamp labels require a non-blank ${field} label.`);
        let parsed: unknown;
        try { parsed = JSON.parse(record[`${field}Timestamps`]); }
        catch { throw new Error(`Invalid ${field}Timestamps JSON in label CSV.`); }
        timestamps[field] = timeRanges(parsed, true);
      }
    }
    return { adId, sourceUrl: source.href, ...(mediaSha256 ? { mediaSha256: mediaSha256.toLowerCase() } : {}), ...(taxonomyVersion ? { taxonomyVersion } : {}), fields, timestamps };
  });
  if (!result.length || !labels) throw new Error("No human-labelled fields were supplied; no accuracy can be reported.");
  return result;
}
const BOOLEAN_FIELDS = new Set<string>(["personTalkingToCamera", "music_lyrics_present", "has_licensed_music_lyrics", ...CREATIVE_BOOLEAN_TAGS]);
const CATEGORY_FIELDS = new Set<string>(["format", "hook_type", "offer_type", "audio_type", ...BOOLEAN_FIELDS]);
function expectedText(value: string, field: EvaluationField, taxonomyVersion?: string): string {
  const taxonomy = field === "format" ? FORMAT_VALUES : field === "hook_type" ? HOOK_TYPE_VALUES : field === "offer_type" ? OFFER_TYPE_VALUES
    : field === "audio_type" ? AUDIO_TYPE_VALUES : field === "angle" && taxonomyVersion ? ANGLE_VALUES : null;
  if (taxonomy && !taxonomy.some((entry) => canonical(entry) === canonical(value)) && !(canonical(value) === "unknown" && !taxonomyVersion))
    throw new Error(`${field === "format" ? "Format" : field} labels must use the documented ${field} taxonomy.`);
  if (BOOLEAN_FIELDS.has(field) && !["true", "false", "unknown"].includes(canonical(value)))
    throw new Error(`${field} labels must be true, false or unknown.`);
  if (value.startsWith("[")) {
    let list: unknown;
    try { list = JSON.parse(value); } catch { throw new Error(`Invalid JSON list in ${field} label.`); }
    if (!Array.isArray(list) || list.some((item) => typeof item !== "string"))
      throw new Error(`${field} JSON labels must be arrays of text.`);
    return list.join("\n");
  }
  return value;
}
function timeRanges(value: unknown, required = false): EvaluationTimestamp[] {
  if (!Array.isArray(value)) {
    if (required) throw new Error("Timestamp labels must be JSON arrays of startSeconds/endSeconds objects.");
    return [];
  }
  const ranges: EvaluationTimestamp[] = [];
  for (const item of value) {
    const range = object(item);
    if (!range || typeof range.startSeconds !== "number" || typeof range.endSeconds !== "number" ||
        !Number.isFinite(range.startSeconds) || !Number.isFinite(range.endSeconds) ||
        range.startSeconds < 0 || range.endSeconds < range.startSeconds) {
      if (required) throw new Error("Timestamp labels need finite non-negative seconds with end >= start.");
      continue;
    }
    ranges.push({ startSeconds: range.startSeconds, endSeconds: range.endSeconds });
  }
  if (required && !ranges.length) throw new Error("A timestamp label must contain at least one interval.");
  return ranges;
}
function canonical(value: string): string {
  return value.normalize("NFKC").replace(/[\u2010-\u2015]/g, "-").trim().toLowerCase().replace(/\s+/g, " ");
}
function tokens(value: string): string[] { return canonical(value).match(/[\p{L}\p{N}]+/gu) || []; }
export function videoTokenF1(expected: string, predicted: string): number {
  const a = tokens(expected), b = tokens(predicted);
  if (!a.length || !b.length) return a.length === b.length ? 1 : 0;
  const counts = new Map<string, number>();
  for (const token of a) counts.set(token, (counts.get(token) || 0) + 1);
  let overlap = 0;
  for (const token of b) {
    const available = counts.get(token) || 0;
    if (available) { overlap++; counts.set(token, available - 1); }
  }
  return overlap ? 2 * overlap / (a.length + b.length) : 0;
}
function timedValue(value: unknown, threshold: number | null): EvaluatedValue {
  if (value === undefined || value === null) return { value: "", timestamps: [], missing: true, abstained: false };
  if (Array.isArray(value)) {
    const entries = value.map((entry) => timedValue(entry, threshold));
    const known = entries.filter((entry) => !entry.missing && !entry.abstained);
    return { value: known.length ? known.map((entry) => entry.value).join("\n") : "unknown",
      timestamps: known.flatMap((entry) => entry.timestamps), missing: false, abstained: !known.length };
  }
  const annotation = object(value);
  if (!annotation) return { value: "", timestamps: [], missing: true, abstained: false };
  const confidence = annotation.confidence;
  const raw = annotation.value;
  if (typeof raw !== "string" && typeof raw !== "boolean") return { value: "", timestamps: [], missing: true, abstained: false };
  const unknown = ["unknown", "unsure"].includes(canonical(String(raw)));
  const filtered = threshold !== null && (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < threshold || confidence > 1);
  const abstained = unknown || filtered;
  return { value: unknown ? String(raw) : filtered ? "unknown" : String(raw), timestamps: abstained ? [] : timeRanges(annotation.timestamps), missing: false, abstained };
}
/** Record only request controls, never whole raw requests or provider responses. Missing metadata stays distinct. */
function settingMetadata(value: unknown, keys: string[]): Record<string, unknown> | null {
  const source = object(value);
  if (!source) return null;
  return Object.fromEntries(keys.filter((key) => Object.hasOwn(source, key)).map((key) => {
    const item = source[key];
    if (item !== null && typeof item !== "boolean" && !(typeof item === "number" && Number.isFinite(item)) && !(typeof item === "string" && item.length <= 200))
      throw new Error("Prediction inference settings must contain bounded scalar request controls.");
    return [key, item];
  }));
}
function parsePredictions(input: unknown): Prediction[] {
  const wrapper = object(input);
  const entries = Array.isArray(input) ? input : wrapper?.predictions ?? wrapper?.analyses ?? wrapper?.records;
  if (!Array.isArray(entries) || !entries.length) throw new Error("Prediction export must contain a non-empty predictions array.");
  return entries.map((value): Prediction => {
    const entry = object(value);
    if (!entry || !plain(entry.adId)) throw new Error("Every prediction needs its exact labelled adId.");
    const analysis = object(entry.analysis) || object(entry.result) || entry;
    const fields = object(analysis.fields) || analysis;
    const source = object(analysis.metadata) || analysis;
    const recorded = (key: string) => source[key] ?? analysis[key] ?? entry[key];
    const version = source.modelVersion ?? entry.modelVersion;
    const metadata: PredictionMetadata = {
      provider: plain(source.provider) || plain(entry.provider),
      model: plain(source.model) || plain(source.modelName) || plain(entry.model) || plain(entry.modelName),
      modelVersion: version === null || source.modelVersion === null ? null : plain(version),
      processingMode: plain(source.processingMode) || plain(entry.processingMode),
      promptVersion: plain(source.promptVersion) || plain(entry.promptVersion),
      requestedModel: plain(recorded("requestedModel")) || null,
      servedModel: plain(recorded("servedModel")) || null,
      analysisConfigSha256: plain(recorded("analysisConfigSha256")) || null,
      inferenceSettings: settingMetadata(recorded("inferenceSettings"), ["mediaResolution", "generationSeed"]),
      generation: settingMetadata(recorded("generation"), ["temperature", "seedRequested", "seedApplied", "mediaResolutionRequested", "mediaResolutionApplied", "providerMediaResolution"]),
    };
    const unavailable = entry.status === "not_implemented" || entry.status === "stub" || analysis.status === "not_implemented" || analysis.stub === true;
    const mediaSha256 = plain(analysis.mediaSha256) || plain(entry.mediaSha256);
    if (!unavailable && !/^[a-f0-9]{64}$/i.test(mediaSha256))
      throw new Error("Complete predictions require a valid stored-video mediaSha256 for comparable real-ad evaluation.");
    if (entry.source === "sample" || analysis.provenance === "sample") throw new Error("Fictional sample predictions cannot benchmark real-ad labels.");
    if ((!metadata.provider || !metadata.model || metadata.modelVersion === "" || !metadata.processingMode || !metadata.promptVersion) && !unavailable)
      throw new Error("Complete predictions need provider, model, modelVersion (or explicit null), processingMode and promptVersion metadata.");
    if (unavailable) {
      metadata.provider ||= "unavailable-provider";
      metadata.model ||= "not_implemented";
      metadata.modelVersion ||= "not_implemented";
      metadata.processingMode ||= "not_implemented";
      metadata.promptVersion ||= "not_implemented";
    }
    const tags = object(fields.tags);
    return { adId: entry.adId, mediaSha256: unavailable ? null : mediaSha256.toLowerCase(), metadata,
      fields: { ...fields, ...Object.fromEntries(CREATIVE_BOOLEAN_TAGS.filter(tag => tags && Object.hasOwn(tags, tag)).map(tag => [tag, tags![tag]])) }, unavailable };
  });
}
function rangeIou(a: EvaluationTimestamp, b: EvaluationTimestamp): number {
  const intersection = Math.max(0, Math.min(a.endSeconds, b.endSeconds) - Math.max(a.startSeconds, b.startSeconds));
  const union = Math.max(a.endSeconds, b.endSeconds) - Math.min(a.startSeconds, b.startSeconds);
  return union === 0 ? 1 : intersection / union;
}

/** Offline scoring only: human labels never enter a model request. */
export function evaluateVideoPredictions(labels: HumanVideoLabel[], exports: unknown[], options: VideoEvaluationOptions = {}) {
  const threshold = options.confidenceThreshold ?? 0;
  const calibrationThreshold = options.confidenceThreshold ?? null;
  const tolerance = options.timestampToleranceSeconds ?? 0.5;
  const iouThreshold = options.timestampIouThreshold ?? 0.5;
  if (!labels.length || !exports.length) throw new Error("Provide human labels and at least one prediction export.");
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1 || !Number.isFinite(tolerance) || tolerance < 0 ||
      !Number.isFinite(iouThreshold) || iouThreshold < 0 || iouThreshold > 1) throw new Error("Invalid evaluation thresholds.");
  const groups = new Map<string, { metadata: Prediction["metadata"]; predictions: Map<string, Prediction> }>();
  const mediaByAd = new Map<string, string>();
  const labelById = new Map(labels.map((label) => [label.adId, label]));
  for (const input of exports) for (const prediction of parsePredictions(input)) {
    if (!prediction.unavailable) {
      const previousHash = mediaByAd.get(prediction.adId);
      if (previousHash && previousHash !== prediction.mediaSha256)
        throw new Error("The same adId has different stored-video hashes across configurations; benchmark each actual video separately.");
      const labelHash = labelById.get(prediction.adId)?.mediaSha256;
      if (labelHash && labelHash.toLowerCase() !== prediction.mediaSha256)
        throw new Error("A prediction's stored video does not match the human-labelled mediaSha256.");
      mediaByAd.set(prediction.adId, prediction.mediaSha256!);
    }
    const key = JSON.stringify(prediction.metadata);
    let group = groups.get(key);
    if (!group) { group = { metadata: prediction.metadata, predictions: new Map() }; groups.set(key, group); }
    if (group.predictions.has(prediction.adId)) throw new Error("Duplicate predictions for the same ad/model/mode/prompt configuration.");
    group.predictions.set(prediction.adId, prediction);
  }
  const labelIds = new Set(labels.map((label) => label.adId));
  const configurations = [...groups.values()].map(({ metadata, predictions }) => {
    const available = [...predictions.values()].some((prediction) => !prediction.unavailable);
    const fields = Object.fromEntries(VIDEO_EVALUATION_FIELDS.map((field) => {
      const score: VideoFieldScore = { labelled: 0, exactMatches: 0, accuracy: null, answered: 0, coverage: null,
        abstentions: 0, missingPredictions: 0, textLabels: 0, meanTokenF1: null, timestampLabels: 0,
        timestampMatches: 0, timestampAccuracy: null, meanTimestampIou: null };
      let f1 = 0, iouSum = 0;
      for (const label of labels) {
        const expected = label.fields[field];
        if (expected === undefined) continue;
        score.labelled++;
        const prediction = predictions.get(label.adId);
        const parsed = prediction && !prediction.unavailable ? timedValue(prediction.fields[field], calibrationThreshold)
          : { value: "", timestamps: [], missing: true, abstained: false };
        if (parsed.missing) score.missingPredictions++;
        else if (parsed.abstained) score.abstentions++;
        else score.answered++;
        if (!parsed.missing && canonical(parsed.value) === canonical(expected)) score.exactMatches++;
        if (!CATEGORY_FIELDS.has(field) && !(field === "angle" && label.taxonomyVersion)) {
          score.textLabels++;
          f1 += parsed.missing || parsed.abstained && canonical(expected) !== "unknown" ? 0 : videoTokenF1(expected, parsed.value);
        }
        for (const expectedTime of label.timestamps[field] || []) {
          score.timestampLabels++;
          let bestIou = 0, match = false;
          for (const predictedTime of parsed.timestamps) {
            const overlap = rangeIou(expectedTime, predictedTime);
            bestIou = Math.max(bestIou, overlap);
            if (overlap >= iouThreshold || Math.abs(expectedTime.startSeconds - predictedTime.startSeconds) <= tolerance &&
                Math.abs(expectedTime.endSeconds - predictedTime.endSeconds) <= tolerance) match = true;
          }
          iouSum += bestIou;
          if (match) score.timestampMatches++;
        }
      }
      if (available && score.labelled) { score.accuracy = score.exactMatches / score.labelled; score.coverage = score.answered / score.labelled; }
      if (available && score.textLabels) score.meanTokenF1 = f1 / score.textLabels;
      if (available && score.timestampLabels) { score.timestampAccuracy = score.timestampMatches / score.timestampLabels; score.meanTimestampIou = iouSum / score.timestampLabels; }
      return [field, score];
    })) as Record<EvaluationField, VideoFieldScore>;
    return { ...metadata, confidenceThreshold: threshold, confidencePolicy: calibrationThreshold === null ? "uncalibrated-not-filtered" : "uncalibrated-explicit-calibration-experiment", status: available ? "scored" : "not_implemented", labelledAds: labels.length,
      predictedLabelledAds: labels.filter((label) => { const prediction = predictions.get(label.adId); return prediction && !prediction.unavailable; }).length,
      missingAdIds: labels.filter((label) => !predictions.has(label.adId) || predictions.get(label.adId)!.unavailable).map((label) => label.adId),
      ignoredUnlabelledPredictions: [...predictions.keys()].filter((id) => !labelIds.has(id)).length, fields };
  });
  return { schemaVersion: "exter-video-evaluation-v2", labelSetSha256: createHash("sha256").update(JSON.stringify(labels)).digest("hex"),
    labelledAds: labels.length, humanLabelsWithMediaHash: labels.filter((label) => label.mediaSha256).length,
    mediaIdentityDefinition: "Complete predictions require stored-video SHA-256 hashes. The same ad ID must have the same hash across configurations and must match the human label hash when supplied.",
    confidenceThresholdDefault: threshold, timestampToleranceSeconds: tolerance,
    confidencePolicy: calibrationThreshold === null ? "uncalibrated-not-filtered" : "uncalibrated-explicit-calibration-experiment",
    confidenceDefinition: "Model confidence is uncalibrated. By default it never filters evidence and stored model thresholds are ignored. An explicit offline confidenceThreshold is a calibration experiment, not a production filtering rule.",
    configurationDefinition: "Provider, requested/served model, exact revision, processing mode, prompt, recorded request settings and configuration hash are scored separately. Missing historical settings are not assumed to equal current defaults.",
    timestampIouThreshold: iouThreshold,
    accuracyDefinition: "Exact canonical label match across every non-blank labelled field, including missing predictions as incorrect. Free-text exact match and token F1 are lexical, not semantic correctness.",
    coverageDefinition: "Non-abstained predictions divided by labelled fields. Explicit unknown/unsure labels can be correct while still abstaining.",
    timingDefinition: "An expected interval matches any predicted interval with IoU at least the threshold or both boundaries within tolerance. Unknown/missing timestamps score zero.",
    configurations };
}
