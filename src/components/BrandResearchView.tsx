import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  ArrowDownToLine,
  BookOpen,
  BrainCircuit,
  Clock3,
  FileText,
  FlaskConical,
  Globe2,
  Info,
  Leaf,
  LoaderCircle,
  Quote,
  RefreshCw,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import type { BrandResearch } from "../../shared/brand-research";
import { api } from "../lib/api";
import "./brand-research.css";

function observedTime(value: string) {
  if (!Number.isFinite(Date.parse(value)))
    return "Observation time unavailable";
  return `${new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  }).format(new Date(value))} London`;
}

function deliveryDate(value?: string) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Not supplied";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function safeSource(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

function SourceLink({
  url,
  label = "View source",
  className = "br-source-link",
}: {
  url: string;
  label?: string;
  className?: string;
}) {
  const href = safeSource(url);
  return href ? (
    <a className={className} href={href} target="_blank" rel="noreferrer">
      {label} <ArrowUpRight size={13} />
    </a>
  ) : (
    <span className="br-muted">Source URL unavailable</span>
  );
}

function sourceName(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "Source";
  }
}

function safeVisual(value: string) {
  if (/^\/images\/[a-zA-Z0-9_.-]+$/.test(value)) return value;
  if (/^data:image\/(?:jpeg|png|webp);base64,[a-zA-Z0-9+/=]+$/.test(value))
    return value;
  return safeSource(value);
}

export function BrandResearchView({
  brandId,
  onUpdated,
}: {
  brandId: string;
  onUpdated?: () => void;
}) {
  const [profile, setProfile] = useState<BrandResearch | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showAllLibraryAds, setShowAllLibraryAds] = useState(false);
  const currentBrand = useRef(brandId);

  useEffect(() => {
    let current = true;
    currentBrand.current = brandId;
    setProfile(null);
    setLoading(true);
    setBusy(false);
    setError("");
    setShowAllLibraryAds(false);
    api<BrandResearch | null>(
      `/api/brand-research?brandId=${encodeURIComponent(brandId)}`,
    )
      .then((result) => {
        if (current) setProfile(result);
      })
      .catch((failure) => {
        if (current) setError((failure as Error).message);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [brandId]);

  async function research() {
    const requestedBrand = brandId;
    setBusy(true);
    setError("");
    try {
      const result = await api<BrandResearch>("/api/brand-research", {
        brandId,
      });
      if (currentBrand.current !== requestedBrand) return;
      setProfile(result);
      onUpdated?.();
    } catch (failure) {
      if (currentBrand.current === requestedBrand)
        setError((failure as Error).message);
    } finally {
      if (currentBrand.current === requestedBrand) setBusy(false);
    }
  }

  function downloadReport() {
    if (!profile) return;
    const library = profile.adLibraryEvidence;
    const source = (url: string) => safeSource(url) || "Source URL unavailable";
    const quote = (value: string) =>
      value
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
    const lines = [
      `# ${profile.brandName} — public brand research`,
      `Observed: ${profile.observedAt}`,
      `Category: ${profile.category}`,
      `Website: https://${profile.domain}`,
      "## Performance conclusion",
      library?.records.length
        ? "Real Meta Ad Library records are included as a bounded research sample. An engagement-format winner is not yet measurable: the retrieved records do not supply engagement counts and a consistent denominator. Ad presence, format frequency and delivery duration do not establish engagement performance."
        : "Ad-format winner: not yet measurable from this research snapshot. No verified public ad-performance dataset is included. Website strategy, brand claims and creator recruitment do not establish a winning format or engagement rate.",
      ...(library?.records.length
        ? [
            "## Public ad-library sample",
            `Source: ${library.source}. Captured: ${library.capturedAt}. Advertiser: ${library.advertiserName} (page ${library.advertiserPageId}).`,
            `${library.records.length} observed records in a bounded sample; this is not the advertiser's total ad count or exhaustive category coverage.`,
            `Search source: ${source(library.queryUrl)}`,
            "Dates below are ad delivery dates supplied by the library, not original post publication dates. Status is as shown at capture, not a live delivery check. Engagement rate: N/A, counts and denominator not supplied.",
            ...library.records.flatMap((ad) => [
              `### Ad ${ad.providerAdId || ad.id} — ${ad.format || "Media format not supplied"}`,
              `Status shown at capture: ${ad.deliveryStatus || "unknown"}. Delivery began: ${deliveryDate(ad.deliveryStartAt)}. Delivery ended: ${deliveryDate(ad.deliveryStopAt)}.`,
              ...(ad.brandedContentPartner
                ? [
                    `Library-attributed creator: ${ad.brandedContentPartner.name} (page ${ad.brandedContentPartner.pageId}). This is source attribution, not verified audience fit or performance.`,
                    ...(ad.brandedContentPartner.profileUrl
                      ? [`Creator profile: ${source(ad.brandedContentPartner.profileUrl)}`]
                      : []),
                  ]
                : []),
              ad.copy ? `Copy excerpt:\n${quote(ad.copy)}` : "Copy unavailable.",
              `Source: ${ad.sourceUrl ? source(ad.sourceUrl) : "Source URL unavailable"}`,
            ]),
            ...library.limitations.map((limitation) => `- ${limitation}`),
          ]
        : []),
      "## Public website observations",
      ...profile.facts.flatMap((fact) => [
        `### ${fact.label}`,
        fact.value,
        `Evidence label: ${fact.kind === "brand_claim" ? "Brand-published claim; not independently verified" : "Observed on the cited source"}.`,
        fact.quote ? quote(fact.quote) : "",
        `Source: ${source(fact.sourceUrl)}`,
      ]),
      "## Exter's website interpretation",
      "Model interpretations concern the supplied website text, not verified social ads or actual audience demographics.",
      profile.analysis
        ? `Provenance: ${profile.analysis.provenance}`
        : `Unavailable. Status: ${profile.analysisStatus}`,
      ...(profile.analysis
        ? [
            `Topic: ${profile.analysis.topic || "Not established"}`,
            `Theme: ${profile.analysis.theme || "Not established"}`,
            `Content type: ${profile.analysis.contentType || "Not established"}`,
            `Orientation: ${profile.analysis.contentOrientation || "Not established"}`,
            "Source-message extract:",
            quote(profile.analysis.keyMessage || "Not available"),
            `Inferred interests (hypotheses): ${profile.analysis.inferredAudience?.join("; ") || "Not established"}`,
            profile.analysis.observedRelevance || "",
            profile.analysis.method ? `Method: ${profile.analysis.method}` : "",
            profile.analysis.model ? `Model: ${profile.analysis.model}` : "",
          ]
        : []),
      "## Candidate competitors",
      "This is a research comparison set, not a validated competitive-pressure or ad-performance ranking.",
      ...profile.competitorCandidates.flatMap((competitor) => [
        `### ${competitor.name} (candidate)`,
        competitor.summary,
        ...competitor.evidence.map((evidence) => `- ${evidence}`),
        `Source: ${source(competitor.sourceUrl)}`,
      ]),
      "## Website-featured creator profiles",
      "Featured on the brand's website only. No paid relationship, follower count or audience match has been verified.",
      ...profile.creatorFeatures.map(
        (creator) =>
          `- ${creator.handle}: ${source(creator.url)}. Website evidence: ${source(creator.sourceUrl)}`,
      ),
      "## Creative hypotheses to test",
      ...profile.proposedTests.flatMap((test) => [
        `### ${test.format} — hypothesis`,
        test.hypothesis,
        ...test.evidenceSourceUrls.map((url) => `Evidence: ${source(url)}`),
      ]),
      "## Source log",
      ...profile.sources.flatMap((item) => [
        `- ${item.title} (${item.kind}; ${item.status}); observed ${item.observedAt}`,
        `  ${source(item.url)}`,
      ]),
      "## Source access checks",
      ...(
        (
          profile as BrandResearch & {
            coverageChecks?: {
              label: string;
              url: string;
              status: string;
              message: string;
            }[];
          }
        ).coverageChecks || []
      ).map(
        (check) =>
          `- ${check.label}: ${check.status}. ${check.message} Source: ${source(check.url)}`,
      ),
      "## Limitations",
      ...profile.limitations.map((limitation) => `- ${limitation}`),
    ];
    const url = URL.createObjectURL(
      new Blob([lines.filter(Boolean).join("\n\n") + "\n"], {
        type: "text/markdown;charset=utf-8",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `exter-${profile.brandName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-public-research.md`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  if (loading)
    return (
      <div className="br-loading">
        <LoaderCircle size={24} className="spin" />
        <h2>Reading the brand evidence…</h2>
        <p>Website observations and ad performance are kept separate.</p>
      </div>
    );

  if (!profile)
    return (
      <section className="br-empty">
        <span className="br-empty-icon">
          <Globe2 size={27} />
        </span>
        <span className="br-eyebrow">PUBLIC BRAND RESEARCH</span>
        <h2>Start with the public website.</h2>
        <p>
          Read the brand’s positioning, offers and published claims, then let
          Exter interpret the available text. A client advertising account is
          not required.
        </p>
        <button className="button primary" onClick={research} disabled={busy}>
          {busy ? (
            <LoaderCircle size={15} className="spin" />
          ) : (
            <BookOpen size={15} />
          )}
          {busy ? "Researching public website…" : "Research public website"}
        </button>
        <p className="br-empty-note">
          Website research does not establish which ad formats earn engagement.
          That requires actual creative and performance evidence.
        </p>
        {error && (
          <p className="br-error" role="alert">
            {error}
          </p>
        )}
      </section>
    );

  const analysis = profile.analysis;
  const visualEvidence = profile.visualEvidence || [];
  const library = profile.adLibraryEvidence;
  const libraryAds = [...(library?.records || [])].sort((a, b) => {
    const activeFirst =
      Number(b.deliveryStatus === "active") -
      Number(a.deliveryStatus === "active");
    return (
      activeFirst ||
      (b.deliveryStartAt || "").localeCompare(a.deliveryStartAt || "")
    );
  });
  const libraryFormats = libraryAds.reduce<Record<string, number>>((counts, ad) => {
    const format = ad.format || "Not supplied";
    counts[format] = (counts[format] || 0) + 1;
    return counts;
  }, {});
  return (
    <div className="br-stack">
      <section className="br-hero">
        <div className="br-hero-copy">
          <span className="br-eyebrow">
            <Leaf size={15} /> REAL BRAND ·{" "}
            {libraryAds.length
              ? "WEBSITE + AD-LIBRARY EVIDENCE"
              : "PUBLIC WEBSITE EVIDENCE"}
          </span>
          <h2>{profile.brandName}, in focus.</h2>
          <p>
            A sourced look at {profile.category.toLowerCase()}, brand
            positioning{libraryAds.length ? ", observed public ads" : ""} and
            creative directions worth testing.
          </p>
          <div className="br-observed">
            <Clock3 size={13} /> Website observed {observedTime(profile.observedAt)}
          </div>
          <div className="br-official-links">
            <SourceLink
              url={`https://${profile.domain}`}
              label={profile.domain}
            />
            {profile.socialProfiles.map((social, index) => (
              <SourceLink
                key={`${social.platform}-${index}`}
                url={social.url}
                label={social.platform}
              />
            ))}
          </div>
        </div>
        <div className="br-hero-action">
          <span className="br-source-count">
            <FileText size={16} /> {profile.sources.length} reviewed sources
          </span>
          <button
            className="button secondary"
            onClick={research}
            disabled={busy}
          >
            {busy ? (
              <LoaderCircle size={14} className="spin" />
            ) : (
              <RefreshCw size={14} />
            )}
            {busy ? "Researching…" : "Refresh website research"}
          </button>
          <button className="button primary" onClick={downloadReport}>
            <ArrowDownToLine size={14} />
            Download research report
          </button>
        </div>
      </section>

      {error && (
        <p className="br-error" role="alert">
          {error}
        </p>
      )}

      <section
        className="br-performance-gap"
        aria-label="Ad performance status"
      >
        <span>
          <ShieldCheck size={21} />
        </span>
        <div>
          <h3>Ad-format winner: not yet measurable</h3>
          <p>
            {libraryAds.length
              ? `${libraryAds.length} real Meta Ad Library records are available below. The library supplied creative and delivery evidence, but no usable engagement counts and denominator. We can compare what was advertised; we cannot yet rank its engagement performance.`
              : "This website-research snapshot includes no verified public ad-performance dataset. Website positioning and creator recruitment can support creative hypotheses; they do not prove a winning format or engagement rate."}
          </p>
        </div>
        <span className="br-pill">Evidence gap</span>
      </section>

      {library && libraryAds.length > 0 && (
        <section
          className="br-library-evidence"
          aria-labelledby="brand-library-title"
        >
          <div className="br-section-heading">
            <div>
              <h2 id="brand-library-title">Observed public ads</h2>
              <p>
                Real {library.source} records for {library.advertiserName}.
                This dated sample is shown independently of dashboard filters.
              </p>
            </div>
            <span className="br-pill">Bounded sample · not live</span>
          </div>
          <div className="br-library-summary">
            <div>
              <strong>{libraryAds.length} observed ad records</strong>
              <p>
                Captured {observedTime(library.capturedAt)} · Advertiser page{" "}
                {library.advertiserPageId}. This sample does not establish the
                advertiser’s total ads or category coverage.
              </p>
              <div className="br-library-formats">
                {Object.entries(libraryFormats).map(([format, count]) => (
                  <span className="br-pill" key={format}>
                    {format}: {count}
                  </span>
                ))}
              </div>
              <p>
                These are media labels supplied by the library. They do not
                establish UGC or influencer origin, or which style works best.
              </p>
            </div>
            <SourceLink url={library.queryUrl} label="Open public library" />
          </div>
          <div className="br-library-grid">
            {(showAllLibraryAds ? libraryAds : libraryAds.slice(0, 6)).map((ad) => (
              <article className="br-card br-library-ad" key={ad.id}>
                <div className="br-library-ad-top">
                  <span className="br-pill">{ad.format || "Media unknown"}</span>
                  <span>
                    {ad.deliveryStatus === "active"
                      ? "Shown active at capture"
                      : ad.deliveryStatus === "inactive"
                        ? "Shown inactive at capture"
                        : "Delivery status unavailable"}
                  </span>
                </div>
                <h3>{ad.title || ad.brand}</h3>
                <p className="br-library-copy">
                  {ad.copy
                    ? `${ad.copy.slice(0, 240)}${ad.copy.length > 240 ? "…" : ""}`
                    : "Ad copy was not supplied in this record."}
                </p>
                {ad.brandedContentPartner && (
                  <div className="br-library-creator">
                    <span>Library-attributed creator</span>
                    <strong>{ad.brandedContentPartner.name}</strong>
                    {ad.brandedContentPartner.profileUrl && (
                      <SourceLink
                        url={ad.brandedContentPartner.profileUrl}
                        label="Creator profile"
                      />
                    )}
                    <p>Source attribution; audience fit and performance unverified.</p>
                  </div>
                )}
                <dl>
                  <div>
                    <dt>Library ID</dt>
                    <dd>{ad.providerAdId || "Not supplied"}</dd>
                  </div>
                  <div>
                    <dt>Delivery began</dt>
                    <dd>{deliveryDate(ad.deliveryStartAt)}</dd>
                  </div>
                  <div>
                    <dt>Delivery ended</dt>
                    <dd>{deliveryDate(ad.deliveryStopAt)}</dd>
                  </div>
                  <div>
                    <dt>Engagement rate</dt>
                    <dd>N/A · counts unavailable</dd>
                  </div>
                </dl>
                {ad.sourceUrl && (
                  <SourceLink url={ad.sourceUrl} label="Go to source ad" />
                )}
              </article>
            ))}
          </div>
          {libraryAds.length > 6 && (
            <button
              className="button secondary br-library-toggle"
              onClick={() => setShowAllLibraryAds((value) => !value)}
              aria-expanded={showAllLibraryAds}
            >
              {showAllLibraryAds
                ? "Show fewer records"
                : `Show all ${libraryAds.length} observed records`}
            </button>
          )}
          <p className="br-library-note">
            Dates describe ad delivery, not original post publication. Missing
            engagement is unavailable, not zero. Ad longevity and format counts
            alone do not prove performance.
          </p>
        </section>
      )}

      {visualEvidence.length > 0 && (
        <section
          className="br-visual-grid"
          aria-label="Website creative evidence"
        >
          {visualEvidence.map((visual, index) => {
            const image = safeVisual(visual.imagePath);
            return image ? (
              <figure
                className="br-visual-evidence"
                key={`${visual.sourceUrl}-${index}`}
              >
                <div className="br-website-visual">
                  <img src={image} alt={visual.description} loading="lazy" />
                  <span>Website creative</span>
                </div>
                <figcaption>
                  <div>
                    <strong>{visual.description}</strong>
                    <p>
                      Public website imagery — not a social ad or ad-performance
                      record.
                    </p>
                  </div>
                  <SourceLink url={visual.sourceUrl} label="Website source" />
                </figcaption>
              </figure>
            ) : null;
          })}
        </section>
      )}

      <section aria-labelledby="brand-observations-title">
        <div className="br-section-heading">
          <div>
            <h2 id="brand-observations-title">What the public sources say</h2>
            <p>
              Observed details and the brand’s own claims, with source quotes.
            </p>
          </div>
          <Globe2 size={18} />
        </div>
        <div className="br-facts-grid">
          {profile.facts.map((fact, index) => (
            <article className="br-card br-fact" key={`${fact.label}-${index}`}>
              <span
                className={`br-pill ${fact.kind === "brand_claim" ? "br-brand-claim" : ""}`}
              >
                {fact.kind === "brand_claim"
                  ? "Brand-published claim"
                  : "Observed on source"}
              </span>
              <h3>{fact.label}</h3>
              <p className="br-fact-value">{fact.value}</p>
              {fact.quote && (
                <blockquote>
                  <Quote size={13} />
                  <span>{fact.quote}</span>
                </blockquote>
              )}
              <SourceLink url={fact.sourceUrl} />
            </article>
          ))}
        </div>
      </section>

      <section className="br-analysis-grid">
        <div className="br-card br-analysis-card">
          <div className="br-section-heading">
            <div>
              <span className="br-eyebrow">
                <BrainCircuit size={15} /> EXTER’S WEBSITE INTERPRETATION
              </span>
              <h2>Signals behind the positioning.</h2>
              <p>
                Model interpretations of website text, not verified ad findings.
              </p>
            </div>
          </div>
          {analysis ? (
            <>
              <span className="br-pill">
                {analysis.provenance === "model"
                  ? "Local model inference"
                  : analysis.provenance === "sample"
                    ? "Sample interpretation"
                    : "Provided interpretation"}
              </span>
              <dl className="br-analysis-details">
                {[
                  ["Topic", analysis.topic],
                  ["Theme", analysis.theme],
                  ["Content type", analysis.contentType],
                  ["Orientation", analysis.contentOrientation],
                  ["Source-message extract", analysis.keyMessage],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value || "Not established from available text"}</dd>
                  </div>
                ))}
              </dl>
              {analysis.inferredAudience?.length ? (
                <div className="br-inferred-interests">
                  <span>Inferred interests · hypothesis</span>
                  <div>
                    {analysis.inferredAudience.map((audience) => (
                      <span className="br-interest-tag" key={audience}>
                        {audience}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              <details className="br-model-details">
                <summary>Analysis method and coverage</summary>
                {analysis.observedRelevance && (
                  <p>{analysis.observedRelevance}</p>
                )}
                {analysis.method && <p>{analysis.method}</p>}
                {analysis.model && <code>{analysis.model}</code>}
              </details>
            </>
          ) : (
            <div className="br-analysis-unavailable">
              <Info size={21} />
              <h3>Model interpretation is not available</h3>
              <p>
                The source observations remain available. Missing analysis has
                not been replaced with invented concepts or audience traits.
              </p>
              <small>
                Status: {profile.analysisStatus.replaceAll("_", " ")}
              </small>
            </div>
          )}
        </div>
        <div className="br-card br-creative-hypotheses">
          <span className="br-eyebrow">
            <FlaskConical size={15} /> CREATIVE TEST PLAN
          </span>
          <h2>Directions to investigate.</h2>
          <p>
            Research-backed hypotheses to test against observed ads and measured
            results. These are not performance recommendations.
          </p>
          {profile.proposedTests.length ? (
            <div className="br-test-list">
              {profile.proposedTests.map((test, index) => (
                <article className="br-test" key={`${test.format}-${index}`}>
                  <div>
                    <span className="br-test-index">0{index + 1}</span>
                    <h3>{test.format}</h3>
                    <span className="br-pill">Hypothesis</span>
                  </div>
                  <p>{test.hypothesis}</p>
                  <div className="br-test-sources">
                    {test.evidenceSourceUrls.map((url, sourceIndex) => (
                      <SourceLink
                        key={`${url}-${sourceIndex}`}
                        url={url}
                        label={sourceName(url)}
                      />
                    ))}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="br-muted">
              No evidence-linked test hypotheses are recorded.
            </p>
          )}
        </div>
      </section>

      <section aria-labelledby="brand-competitors-title">
        <div className="br-section-heading">
          <div>
            <h2 id="brand-competitors-title">Candidate competitor set</h2>
            <p>
              Source-backed brands to investigate. Category overlap is not
              verified competitive pressure or ad performance.
            </p>
          </div>
          <span className="br-pill">Research candidates</span>
        </div>
        {profile.competitorCandidates.length ? (
          <div className="br-competitor-grid">
            {profile.competitorCandidates.map((competitor) => (
              <article
                className="br-card br-competitor"
                key={competitor.domain}
              >
                <div className="br-competitor-top">
                  <span>{competitor.name.slice(0, 1)}</span>
                  <span className="br-pill">Candidate</span>
                </div>
                <h3>{competitor.name}</h3>
                <span className="br-muted">{competitor.domain}</span>
                <p>{competitor.summary}</p>
                {competitor.evidence.length > 0 && (
                  <ul>
                    {competitor.evidence.map((evidence, index) => (
                      <li key={index}>{evidence}</li>
                    ))}
                  </ul>
                )}
                <SourceLink
                  url={competitor.sourceUrl}
                  label="Read the public source"
                />
              </article>
            ))}
          </div>
        ) : (
          <div className="br-card br-inline-empty">
            No source-backed competitor candidates are recorded for this
            workspace.
          </div>
        )}
      </section>

      <section className="br-card">
        <div className="br-section-heading">
          <div>
            <h2>
              <UsersRound size={17} /> Website-featured creator profiles
            </h2>
            <p>
              Featured links on {profile.brandName}’s website. Follower counts,
              paid relationships and audience fit have not been verified.
            </p>
          </div>
        </div>
        {profile.creatorFeatures.length ? (
          <div className="br-creators-grid">
            {profile.creatorFeatures.map((creator) => (
              <article className="br-creator" key={creator.handle}>
                <span className="br-creator-avatar">
                  <UsersRound size={18} />
                </span>
                <h3>{creator.handle}</h3>
                <p>Featured on the brand’s website</p>
                <div>
                  <SourceLink url={creator.url} label="Profile" />
                  <SourceLink
                    url={creator.sourceUrl}
                    label="Website evidence"
                  />
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="br-muted">
            No website-featured creator profiles were identified.
          </p>
        )}
      </section>

      <section className="br-card br-evidence-log">
        <div className="br-section-heading">
          <div>
            <h2>
              <BookOpen size={17} /> Evidence and coverage
            </h2>
            <p>
              Each source is a page observation, not an ad-performance record.
            </p>
          </div>
        </div>
        <div className="br-source-list">
          {profile.sources.map((source) => (
            <article className="br-source-row" key={source.id}>
              <FileText size={17} />
              <div>
                <h3>{source.title || sourceName(source.url)}</h3>
                <p>
                  {source.kind.replaceAll("_", " ")} ·{" "}
                  {observedTime(source.observedAt)}
                </p>
                {source.textExcerpt && (
                  <blockquote>{source.textExcerpt}</blockquote>
                )}
              </div>
              <span className="br-pill">
                {source.status.replaceAll("_", " ")}
              </span>
              <SourceLink url={source.url} label="Open source" />
            </article>
          ))}
        </div>
        <div className="br-limitations">
          <h3>
            <Info size={16} /> What this test does not establish
          </h3>
          <ul>
            {profile.limitations.map((limitation, index) => (
              <li key={index}>{limitation}</li>
            ))}
          </ul>
        </div>
        {(
          (
            profile as BrandResearch & {
              coverageChecks?: {
                label: string;
                url: string;
                status: string;
                message: string;
              }[];
            }
          ).coverageChecks || []
        ).length > 0 && (
          <div className="br-coverage-checks">
            <h3>Source access checks</h3>
            {(
              profile as BrandResearch & {
                coverageChecks?: {
                  label: string;
                  url: string;
                  status: string;
                  message: string;
                }[];
              }
            ).coverageChecks!.map((check, index) => (
              <article key={`${check.label}-${index}`}>
                <div>
                  <strong>{check.label}</strong>
                  <span className="br-pill">
                    {check.status.replaceAll("_", " ")}
                  </span>
                </div>
                <p>{check.message}</p>
                <SourceLink url={check.url} label="Source checked" />
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
