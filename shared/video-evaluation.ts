import { createHash } from "node:crypto";

export const VIDEO_EVALUATION_FIELDS = [
  "hook", "format", "angle", "keyClaims", "spokenTranscript",
  "onScreenText", "cta", "personTalkingToCamera", "creatorEvidence",
] as const;
export type EvaluationField = (typeof VIDEO_EVALUATION_FIELDS)[number];
export interface EvaluationTimestamp { startSeconds: number; endSeconds: number }
export interface HumanVideoLabel {
  adId: string;
  sourceUrl: string;
  mediaSha256?: string;
  fields: Partial<Record<EvaluationField, string>>;
  timestamps: Partial<Record<EvaluationField, EvaluationTimestamp[]>>;
}
export interface VideoEvaluationOptions {
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
}
interface Prediction {
  adId: string;
  mediaSha256: string | null;
  metadata: PredictionMetadata;
  fields: Record<string, unknown>;
  unavailable: boolean;
  threshold: number;
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
  const known = new Set<string>(["adId", "sourceUrl", "mediaSha256", "notes", "labelledBy", "labelledAt", ...VIDEO_EVALUATION_FIELDS, ...VIDEO_EVALUATION_FIELDS.map((v) => `${v}Timestamps`)]);
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
    const fields: HumanVideoLabel["fields"] = {}, timestamps: HumanVideoLabel["timestamps"] = {};
    for (const field of VIDEO_EVALUATION_FIELDS) {
      const value = record[field];
      if (value) { fields[field] = expectedText(value, field); labels++; }
      if (record[`${field}Timestamps`]) {
        if (!value) throw new Error(`Timestamp labels require a non-blank ${field} label.`);
        let parsed: unknown;
        try { parsed = JSON.parse(record[`${field}Timestamps`]); }
        catch { throw new Error(`Invalid ${field}Timestamps JSON in label CSV.`); }
        timestamps[field] = timeRanges(parsed, true);
      }
    }
    return { adId, sourceUrl: source.href, ...(mediaSha256 ? { mediaSha256: mediaSha256.toLowerCase() } : {}), fields, timestamps };
  });
  if (!result.length || !labels) throw new Error("No human-labelled fields were supplied; no accuracy can be reported.");
  return result;
}
function expectedText(value: string, field: EvaluationField): string {
  if (field === "format" && !["ugc", "founder-led", "studio", "animation", "mixed", "unknown"].includes(canonical(value)))
    throw new Error("Format labels must use the documented format taxonomy.");
  if (field === "personTalkingToCamera" && !["true", "false", "unknown"].includes(canonical(value)))
    throw new Error("personTalkingToCamera labels must be true, false or unknown.");
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
function timedValue(value: unknown, threshold: number): EvaluatedValue {
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
  const abstained = canonical(String(raw)) === "unknown" || typeof confidence !== "number" ||
    !Number.isFinite(confidence) || confidence < threshold || confidence > 1;
  return { value: abstained ? "unknown" : String(raw), timestamps: abstained ? [] : timeRanges(annotation.timestamps), missing: false, abstained };
}
function parsePredictions(input: unknown, fallbackThreshold: number): Prediction[] {
  const wrapper = object(input);
  const entries = Array.isArray(input) ? input : wrapper?.predictions ?? wrapper?.analyses ?? wrapper?.records;
  if (!Array.isArray(entries) || !entries.length) throw new Error("Prediction export must contain a non-empty predictions array.");
  return entries.map((value): Prediction => {
    const entry = object(value);
    if (!entry || !plain(entry.adId)) throw new Error("Every prediction needs its exact labelled adId.");
    const analysis = object(entry.analysis) || object(entry.result) || entry;
    const fields = object(analysis.fields) || analysis;
    const source = object(analysis.metadata) || analysis;
    const version = source.modelVersion ?? entry.modelVersion;
    const metadata: PredictionMetadata = {
      provider: plain(source.provider) || plain(entry.provider),
      model: plain(source.model) || plain(source.modelName) || plain(entry.model) || plain(entry.modelName),
      modelVersion: version === null || source.modelVersion === null ? null : plain(version),
      processingMode: plain(source.processingMode) || plain(entry.processingMode),
      promptVersion: plain(source.promptVersion) || plain(entry.promptVersion),
    };
    const unavailable = entry.status === "not_implemented" || entry.status === "stub" || analysis.status === "not_implemented" || analysis.stub === true;
    const mediaSha256 = plain(analysis.mediaSha256) || plain(entry.mediaSha256);
    if (!unavailable && !/^[a-f0-9]{64}$/i.test(mediaSha256))
      throw new Error("Complete predictions require a valid stored-video mediaSha256 for comparable real-ad evaluation.");
    if (entry.source === "sample" || analysis.provenance === "sample") throw new Error("Fictional sample predictions cannot benchmark real-ad labels.");
    if (Object.entries(metadata).some(([key, value]) => key === "modelVersion" ? value === "" : !value) && !unavailable)
      throw new Error("Complete predictions need provider, model, modelVersion (or explicit null), processingMode and promptVersion metadata.");
    if (unavailable) for (const key of Object.keys(metadata) as (keyof typeof metadata)[]) metadata[key] ||= key === "provider" ? "unavailable-provider" : "not_implemented";
    const threshold = source.confidenceThreshold ?? analysis.confidenceThreshold ?? fallbackThreshold;
    if (typeof threshold !== "number" || !Number.isFinite(threshold) || threshold < 0 || threshold > 1)
      throw new Error("Prediction confidence thresholds must be between zero and one.");
    return { adId: entry.adId, mediaSha256: unavailable ? null : mediaSha256.toLowerCase(), metadata, fields, unavailable, threshold };
  });
}
function rangeIou(a: EvaluationTimestamp, b: EvaluationTimestamp): number {
  const intersection = Math.max(0, Math.min(a.endSeconds, b.endSeconds) - Math.max(a.startSeconds, b.startSeconds));
  const union = Math.max(a.endSeconds, b.endSeconds) - Math.min(a.startSeconds, b.startSeconds);
  return union === 0 ? 1 : intersection / union;
}

/** Offline scoring only: human labels never enter a model request. */
export function evaluateVideoPredictions(labels: HumanVideoLabel[], exports: unknown[], options: VideoEvaluationOptions = {}) {
  const threshold = options.confidenceThreshold ?? 0.75;
  const tolerance = options.timestampToleranceSeconds ?? 0.5;
  const iouThreshold = options.timestampIouThreshold ?? 0.5;
  if (!labels.length || !exports.length) throw new Error("Provide human labels and at least one prediction export.");
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1 || !Number.isFinite(tolerance) || tolerance < 0 ||
      !Number.isFinite(iouThreshold) || iouThreshold < 0 || iouThreshold > 1) throw new Error("Invalid evaluation thresholds.");
  const groups = new Map<string, { metadata: Prediction["metadata"]; confidenceThreshold: number; predictions: Map<string, Prediction> }>();
  const mediaByAd = new Map<string, string>();
  const labelById = new Map(labels.map((label) => [label.adId, label]));
  for (const input of exports) for (const prediction of parsePredictions(input, threshold)) {
    if (!prediction.unavailable) {
      const previousHash = mediaByAd.get(prediction.adId);
      if (previousHash && previousHash !== prediction.mediaSha256)
        throw new Error("The same adId has different stored-video hashes across configurations; benchmark each actual video separately.");
      const labelHash = labelById.get(prediction.adId)?.mediaSha256;
      if (labelHash && labelHash.toLowerCase() !== prediction.mediaSha256)
        throw new Error("A prediction's stored video does not match the human-labelled mediaSha256.");
      mediaByAd.set(prediction.adId, prediction.mediaSha256!);
    }
    const key = JSON.stringify({ ...prediction.metadata, confidenceThreshold: prediction.threshold });
    let group = groups.get(key);
    if (!group) { group = { metadata: prediction.metadata, confidenceThreshold: prediction.threshold, predictions: new Map() }; groups.set(key, group); }
    if (group.predictions.has(prediction.adId)) throw new Error("Duplicate predictions for the same ad/model/mode/prompt configuration.");
    group.predictions.set(prediction.adId, prediction);
  }
  const labelIds = new Set(labels.map((label) => label.adId));
  const configurations = [...groups.values()].map(({ metadata, confidenceThreshold, predictions }) => {
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
        const parsed = prediction && !prediction.unavailable ? timedValue(prediction.fields[field], prediction.threshold)
          : { value: "", timestamps: [], missing: true, abstained: false };
        if (parsed.missing) score.missingPredictions++;
        else if (parsed.abstained) score.abstentions++;
        else score.answered++;
        if (!parsed.missing && canonical(parsed.value) === canonical(expected)) score.exactMatches++;
        if (field !== "format" && field !== "personTalkingToCamera") {
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
    return { ...metadata, confidenceThreshold, status: available ? "scored" : "not_implemented", labelledAds: labels.length,
      predictedLabelledAds: labels.filter((label) => { const prediction = predictions.get(label.adId); return prediction && !prediction.unavailable; }).length,
      missingAdIds: labels.filter((label) => !predictions.has(label.adId) || predictions.get(label.adId)!.unavailable).map((label) => label.adId),
      ignoredUnlabelledPredictions: [...predictions.keys()].filter((id) => !labelIds.has(id)).length, fields };
  });
  return { schemaVersion: "exter-video-evaluation-v1", labelSetSha256: createHash("sha256").update(JSON.stringify(labels)).digest("hex"),
    labelledAds: labels.length, humanLabelsWithMediaHash: labels.filter((label) => label.mediaSha256).length,
    mediaIdentityDefinition: "Complete predictions require stored-video SHA-256 hashes. The same ad ID must have the same hash across configurations and must match the human label hash when supplied.",
    confidenceThresholdDefault: threshold, timestampToleranceSeconds: tolerance,
    timestampIouThreshold: iouThreshold,
    accuracyDefinition: "Exact canonical label match across every non-blank labelled field, including missing predictions as incorrect. Free-text exact match and token F1 are lexical, not semantic correctness.",
    coverageDefinition: "Non-abstained predictions divided by labelled fields. Explicit unknown labels can be correct while still abstaining.",
    timingDefinition: "An expected interval matches any predicted interval with IoU at least the threshold or both boundaries within tolerance. Unknown/missing timestamps score zero.",
    configurations };
}
