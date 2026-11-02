import type { ReactNode } from "react";
import { Download, Film, Info, Link2 } from "lucide-react";
import {
  ANGLE_OPTIONS,
  AUDIO_TYPE_OPTIONS,
  CLAIM_TYPE_OPTIONS,
  CREATIVE_BOOLEAN_TAG_OPTIONS,
  FORMAT_OPTIONS,
  HOOK_TYPE_OPTIONS,
  OFFER_TYPE_OPTIONS,
} from "../../shared/creative-taxonomy";
import type {
  CreatorEvidence,
  VideoAnalysisResult,
  VideoClaim,
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

function score(value: number) {
  return `Model-reported score ${Number(value.toFixed(2))} · uncalibrated`;
}

function optionLabel(value: string, options?: ReadonlyArray<readonly [string, string]>) {
  return options?.find(([key]) => key === value)?.[1] || value;
}

function dimensions(width?: number | null, height?: number | null) {
  return width && height ? `${width} × ${height} px` : "Unavailable in this saved result";
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
  options,
  children,
}: {
  label: string;
  field: VideoField<string | boolean>;
  options?: ReadonlyArray<readonly [string, string]>;
  children?: ReactNode;
}) {
  const unknown = field.value === "unknown";
  const value = typeof field.value === "boolean"
    ? field.value ? "Yes" : "No"
    : optionLabel(field.value, options);
  return (
    <div className={`nva-field${unknown ? " nva-unknown" : ""}`}>
      <dt>{label}</dt>
      <dd>
        <p>{value}</p>
        <div className="nva-field-meta">
          <span>{timestamps(field.timestamps)}</span>
          <span>{score(field.confidence)}</span>
        </div>
        {children}
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
      {fields.length ? segments : <p className="nva-details-note">No supported segments saved.</p>}
    </details>
  ) : (
    <section className="nva-section">
      <h4>{label}</h4>
      {segments}
    </section>
  );
}

function Claims({ claims }: { claims: VideoClaim[] }) {
  return <section className="nva-section">
    <h4>Key claims</h4>
    {claims.length ? <dl className="nva-segments">{claims.map((claim, index) => <Field key={index} label={`Claim ${index + 1}`} field={claim}>
      {Boolean(claim.claim_type?.length) && <ul className="nva-tags" aria-label={`Claim ${index + 1} types`}>{claim.claim_type!.map(type => <li key={type}>{optionLabel(type, CLAIM_TYPE_OPTIONS)}</li>)}</ul>}
      {claim.may_need_substantiation_asa && <p className="nva-claim-review">may need substantiation (ASA)</p>}
    </Field>)}</dl> : <p className="nva-small-note">No supported claims saved.</p>}
    <p className="nva-small-note">Claims describe what the ad says. Comparative and superlative tags prompt a substantiation review; they are not a finding that an ad breaches ASA rules. Product claims have not been independently verified.</p>
  </section>;
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
        <span>{score(evidence.confidence)}</span>
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
  const separatedAudio = Boolean(fields.audio_type);
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
        <span>Scores are model-reported and uncalibrated; they are not accuracy probabilities and are not used for filtering in new analyses. Evidence is still required. {analysis.confidencePolicy !== "uncalibrated-not-filtered" && analysis.confidenceThreshold > 0 ? `This historical result used a ${Math.round(analysis.confidenceThreshold * 100)}% score threshold when saved. ` : ""}Timestamps refer to the original stored video.</span>
      </p>

      <dl className="nva-fields">
        {fields.hook_type && <Field label="Hook type" field={fields.hook_type} options={HOOK_TYPE_OPTIONS} />}
        <Field label="Hook explanation · 0–3 seconds" field={fields.hook} />
        <Field label="Format" field={fields.format} options={FORMAT_OPTIONS} />
        <Field label="Angle" field={fields.angle} options={ANGLE_OPTIONS} />
        {fields.angle_explanation && <Field label="Angle explanation" field={fields.angle_explanation} />}
        {fields.offer_type && <Field label="Offer type" field={fields.offer_type} options={OFFER_TYPE_OPTIONS} />}
        {fields.offer_explanation && <Field label="Offer explanation" field={fields.offer_explanation} />}
        <Field label="CTA" field={fields.cta} />
        <Field label="Person talking to camera" field={fields.personTalkingToCamera} />
      </dl>

      {fields.tags && <details className="nva-details">
        <summary>Creative tags</summary>
        <dl className="nva-segments">{CREATIVE_BOOLEAN_TAG_OPTIONS.map(([key, label]) => <Field key={key} label={label} field={fields.tags![key]} />)}</dl>
      </details>}

      <Claims claims={fields.keyClaims} />
      {separatedAudio && <section className="nva-section" aria-label="Audio and music">
        <h4>Audio and music</h4>
        <dl className="nva-fields">
          {fields.audio_type && <Field label="Audio type" field={fields.audio_type} options={AUDIO_TYPE_OPTIONS} />}
          {fields.music_lyrics_present && <Field label="Sung lyrics present" field={fields.music_lyrics_present} />}
          {fields.has_licensed_music_lyrics && <Field label="Licensed music / lyrics" field={fields.has_licensed_music_lyrics} />}
        </dl>
        <p className="nva-small-note">Music and sung lyrics are separate from spoken advertising speech. Lyrics are not reproduced. A music licence remains unknown without trusted rights metadata; it cannot be established by listening.</p>
        {Boolean(fields.audio_segments?.length) && <details className="nva-details">
          <summary>Audio timeline <span>{fields.audio_segments!.length} segments</span></summary>
          <ul className="nva-audio-timeline">{fields.audio_segments!.map((segment, index) => <li key={index}>
            <strong>{segment.kind === "sung_lyrics" ? "Sung lyrics" : segment.kind === "instrumental_music" ? "Instrumental music" : segment.kind === "silence" ? "Silence" : segment.kind === "spoken" ? "Spoken advertising speech" : "Uncertain audio"}</strong>
            <span>{timestamps([segment])} · {segment.speaker_type} · {score(segment.confidence)}</span>
            {segment.kind === "spoken" && segment.text && <p>{segment.text}</p>}
          </li>)}</ul>
        </details>}
      </section>}
      {!separatedAudio && <p className="nva-small-note">Historical audio result: speech and song lyrics were not separately classified. Review this transcript before using it as spoken advertising copy.</p>}
      <Segments label={separatedAudio ? "Spoken transcript · excludes sung lyrics" : "Historical transcript"} fields={fields.spokenTranscript} collapsible />
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
          <div><dt>Requested model</dt><dd>{analysis.requestedModel || analysis.model}</dd></div>
          <div><dt>Served model</dt><dd>{analysis.servedModel || "Not recorded in this result"}</dd></div>
          {!analysis.servedModel && analysis.modelVersion && <div><dt>Historical model revision</dt><dd>{analysis.modelVersion} · not verified as the generation response model</dd></div>}
          <div><dt>Pricing model</dt><dd>{analysis.accounting?.pricing?.model || "Unavailable in this saved result"}</dd></div>
          {analysis.accounting?.pricingReason && <div><dt>Pricing note</dt><dd>{analysis.accounting.pricingReason}</dd></div>}
          <div><dt>Processing mode</dt><dd>{analysis.processingMode === "agentic" ? "Native agentic video (preview)" : "Native static video · see saved coverage"}</dd></div>
          <div><dt>Temperature</dt><dd>{analysis.generation ? analysis.generation.temperature : "Unavailable in this saved result"}</dd></div>
          <div><dt>Fixed seed</dt><dd>{analysis.generation ? `${analysis.generation.seedRequested} · ${analysis.generation.seedApplied ? "applied to request" : "not applied; unsupported by this mode"}` : "Unavailable in this saved result"}</dd></div>
          <div><dt>Requested media resolution</dt><dd>{analysis.generation ? `${analysis.generation.mediaResolutionRequested === "low" ? "Low" : "Default"} · ${analysis.generation.mediaResolutionApplied ? "explicit provider setting" : "provider default; no override applied"}` : "Unavailable in this saved result"}</dd></div>
          <div><dt>Provider-reported media resolution</dt><dd>{analysis.generation?.providerMediaResolution || "Not reported by provider"}</dd></div>
          <div><dt>Stored video dimensions</dt><dd>{dimensions(analysis.normalization?.originalWidth, analysis.normalization?.originalHeight)}</dd></div>
          <div><dt>Uploaded video dimensions</dt><dd>{dimensions(analysis.normalization?.uploadWidth, analysis.normalization?.uploadHeight)}</dd></div>
          <div><dt>Requested sampling</dt><dd>{analysis.sampling?.requestedFps.length ? `${analysis.sampling.requestedFps.join(" / ")} FPS across the saved segments` : "No fixed FPS reported"}</dd></div>
          <div><dt>Scheduled frame estimate</dt><dd>{analysis.sampling?.estimatedFrames == null ? "Unavailable" : `${analysis.sampling.estimatedFrames} frames · duration × requested FPS; not observed frames`}</dd></div>
          <div><dt>Actual frames sampled</dt><dd>{analysis.sampling?.actualFrames == null ? "Not reported by provider" : analysis.sampling.actualFrames}</dd></div>
          {analysis.sampling?.videoInputTokens != null && <div><dt>Video input tokens</dt><dd>{analysis.sampling.videoInputTokens.toLocaleString("en-GB")}</dd></div>}
          <div><dt>Prompt version</dt><dd>{analysis.promptVersion}</dd></div>
          <div><dt>Analysed</dt><dd>{new Date(analysis.createdAt).toLocaleString("en-GB", { timeZone: "Europe/London", timeZoneName: "short" })}</dd></div>
          <div><dt>Coverage</dt><dd>{analysis.coverage.fullVideo ? "Full video" : "Partial video"} · {seconds(analysis.coverage.durationSeconds)} seconds</dd></div>
          {analysis.coverage.segments.map((segment, index) => (
            <div key={index}><dt>Requested segment {index + 1}</dt><dd>{timestamps([segment])} · {segment.processing}{segment.fps !== undefined ? ` · ${segment.fps} FPS requested` : ""}</dd></div>
          ))}
          <div><dt>Stored media</dt><dd>{analysis.mediaId}</dd></div>
          <div><dt>Media SHA-256</dt><dd><code>{analysis.mediaSha256}</code></dd></div>
          <div><dt>Analysis ID</dt><dd>{analysis.id}</dd></div>
        </dl>
      </details>
    </section>
  );
}
