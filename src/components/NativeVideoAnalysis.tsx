import { Download, Film, Info, Link2 } from "lucide-react";
import type {
  CreatorEvidence,
  VideoAnalysisResult,
  VideoField,
  VideoTimestamp,
} from "../../shared/video-analysis";
import "./native-video-analysis.css";

function seconds(value: number) {
  return Number(value.toFixed(2)).toString();
}

function timestamps(ranges: VideoTimestamp[]) {
  return ranges.length
    ? ranges.map((range) => `${seconds(range.startSeconds)}–${seconds(range.endSeconds)} s`).join(" · ")
    : "No supported video interval";
}

function confidence(value: number) {
  return `${Math.round(value * 100)}%`;
}

function sourceLink(value?: string) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function Field({
  label,
  field,
}: {
  label: string;
  field: VideoField<string | boolean>;
}) {
  const unknown = field.value === "unknown";
  const value = typeof field.value === "boolean"
    ? field.value ? "Yes" : "No"
    : field.value;
  return (
    <div className={`nva-field${unknown ? " nva-unknown" : ""}`}>
      <dt>{label}</dt>
      <dd>
        <p>{value}</p>
        <div className="nva-field-meta">
          <span>{timestamps(field.timestamps)}</span>
          <span>Confidence {confidence(field.confidence)}</span>
        </div>
      </dd>
    </div>
  );
}

function Segments({
  label,
  fields,
  collapsible = false,
}: {
  label: string;
  fields: VideoField[];
  collapsible?: boolean;
}) {
  const segments = (
    <dl className="nva-segments">
      {fields.map((field, index) => (
        <Field key={index} label={`${label} ${index + 1}`} field={field} />
      ))}
    </dl>
  );
  return collapsible ? (
    <details className="nva-details">
      <summary>{label} <span>{fields.length} {fields.length === 1 ? "segment" : "segments"}</span></summary>
      {segments}
    </details>
  ) : (
    <section className="nva-section">
      <h4>{label}</h4>
      {segments}
    </section>
  );
}

function Evidence({ evidence }: { evidence: CreatorEvidence }) {
  const url = sourceLink(evidence.sourceUrl);
  return (
    <li>
      <div className="nva-evidence-kind">
        {evidence.kind === "paid-partnership-label" ? "Paid-partnership label" : "Visible creator handle"}
      </div>
      <p>{evidence.value}</p>
      <div className="nva-field-meta">
        <span>{evidence.source === "ad-library" ? "Ad-library source metadata" : timestamps(evidence.timestamps)}</span>
        <span>Confidence {confidence(evidence.confidence)}</span>
      </div>
      {url && <a href={url} target="_blank" rel="noreferrer"><Link2 size={12} /> Evidence source</a>}
    </li>
  );
}

export function NativeVideoAnalysis({
  analysis,
  mediaId,
  sample = false,
}: {
  analysis?: VideoAnalysisResult;
  mediaId?: string;
  sample?: boolean;
}) {
  function download() {
    if (!analysis) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(analysis, null, 2) + "\n"], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `exter-video-${analysis.id.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  if (!analysis) {
    return (
      <section className="nva-empty" aria-label="Native video analysis status">
        <Film size={32} />
        <h3>No saved native video analysis</h3>
        <p>
          {sample
            ? "This is a fictional sample creative. No video-model result has been generated for it."
            : "No native video-model result is saved for this ad. Available ad copy or a thumbnail does not establish its hook, transcript or creator origin."}
        </p>
        {mediaId && <p>A stored video is linked to this record; an analysis result is still unavailable.</p>}
        <p>Video analysis runs in the full application using a stored video file. Results appear here after a successful analysis.</p>
      </section>
    );
  }

  const fields = analysis.fields;
  return (
    <section className="nva-analysis" aria-label="Saved native video analysis">
      <div className="nva-heading">
        <div>
          <span className="nva-eyebrow"><Film size={14} /> SAVED VIDEO INTERPRETATION</span>
          <h3>Native video analysis</h3>
        </div>
        <button type="button" className="nva-download" onClick={download} aria-label="Download native video analysis JSON">
          <Download size={13} /> JSON
        </button>
      </div>

      <p className="nva-note">
        <Info size={14} />
        <span>Scores are model-reported and uncalibrated. Values below {confidence(analysis.confidenceThreshold)} confidence, or without sufficient evidence, stay unknown. Timestamps refer to the original stored video.</span>
      </p>

      <dl className="nva-fields">
        <Field label="Hook · 0–3 seconds" field={fields.hook} />
        <Field label="Format" field={fields.format} />
        <Field label="Angle" field={fields.angle} />
        <Field label="CTA" field={fields.cta} />
        <Field label="Person talking to camera" field={fields.personTalkingToCamera} />
      </dl>

      <Segments label="Key claims" fields={fields.keyClaims} />
      <p className="nva-small-note">Claims describe what the ad says; product claims have not been independently verified.</p>
      <Segments label="Spoken transcript" fields={fields.spokenTranscript} collapsible />
      <Segments label="On-screen text" fields={fields.onScreenText} collapsible />

      <section className="nva-section">
        <h4>Creator evidence</h4>
        {fields.creatorEvidence.length ? (
          <ul className="nva-evidence">
            {fields.creatorEvidence.map((evidence, index) => <Evidence key={index} evidence={evidence} />)}
          </ul>
        ) : <p className="nva-small-note">No qualifying creator evidence is saved. UGC or influencer origin is not established.</p>}
      </section>

      <details className="nva-details nva-provenance">
        <summary>Analysis provenance and coverage</summary>
        <dl>
          <div><dt>Provider</dt><dd>{analysis.provider}</dd></div>
          <div><dt>Model</dt><dd>{analysis.model}</dd></div>
          <div><dt>Model version</dt><dd>{analysis.modelVersion || "Not reported by provider"}</dd></div>
          <div><dt>Processing mode</dt><dd>{analysis.processingMode === "agentic" ? "Native agentic video" : "Native static video · higher-FPS hook"}</dd></div>
          <div><dt>Prompt version</dt><dd>{analysis.promptVersion}</dd></div>
          <div><dt>Analysed</dt><dd>{new Date(analysis.createdAt).toLocaleString("en-GB", { timeZone: "Europe/London", timeZoneName: "short" })}</dd></div>
          <div><dt>Coverage</dt><dd>{analysis.coverage.fullVideo ? "Full video" : "Partial video"} · {seconds(analysis.coverage.durationSeconds)} seconds</dd></div>
          {analysis.coverage.segments.map((segment, index) => (
            <div key={index}><dt>Segment {index + 1}</dt><dd>{timestamps([segment])} · {segment.processing}{segment.fps !== undefined ? ` · ${segment.fps} FPS` : ""}</dd></div>
          ))}
          <div><dt>Stored media</dt><dd>{analysis.mediaId}</dd></div>
          <div><dt>Media SHA-256</dt><dd><code>{analysis.mediaSha256}</code></dd></div>
          <div><dt>Analysis ID</dt><dd>{analysis.id}</dd></div>
        </dl>
      </details>
    </section>
  );
}
