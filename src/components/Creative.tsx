import { useState } from "react";
import {
  ArrowUpRight,
  Bookmark,
  Check,
  Eye,
  Heart,
  Play,
  X,
  ExternalLink,
  Info,
  Layers,
} from "lucide-react";
import type { Ad } from "../../shared/types";
import { number, percent } from "../lib/api";

export function PlatformIcon({ platform }: { platform: string }) {
  return (
    <span
      className={`platform-icon platform-${platform.toLowerCase()}`}
      aria-label={platform}
    >
      {platform === "Meta" ? "∞" : platform === "TikTok" ? "♪" : "G"}
    </span>
  );
}
export function AdCard({ ad, onOpen }: { ad: Ad; onOpen: (ad: Ad) => void }) {
  const [saved, setSaved] = useState(() => {
    try {
      return JSON.parse(
        localStorage.getItem("exter-saved-ads") || "[]",
      ).includes(ad.id);
    } catch {
      return false;
    }
  });
  function save() {
    let ids: string[] = [];
    try {
      ids = JSON.parse(localStorage.getItem("exter-saved-ads") || "[]");
    } catch {}
    const next = saved ? ids.filter((id) => id !== ad.id) : [...ids, ad.id];
    localStorage.setItem("exter-saved-ads", JSON.stringify(next));
    setSaved(!saved);
  }
  return (
    <article className="ad-card">
      <div className="ad-card-top">
        <div className="brand-mini" style={{ background: ad.color }}>
          {ad.brand.slice(0, 1)}
        </div>
        <div>
          <strong>{ad.brand}</strong>
          <span>
            {ad.platform} · {ad.format}
          </span>
        </div>
        <button
          className={`icon-button bookmark ${saved ? "is-saved" : ""}`}
          aria-label={saved ? "Unsave ad" : "Save ad"}
          onClick={save}
        >
          {saved ? <Check size={16} /> : <Bookmark size={16} />}
        </button>
      </div>
      <button
        className="ad-image"
        onClick={() => onOpen(ad)}
        aria-label={`View ${ad.brand}: ${ad.title}`}
      >
        {ad.image ? (
          <img
            src={ad.image}
            alt={`${ad.brand} sample ${ad.category.toLowerCase()} creative`}
            loading="lazy"
          />
        ) : (
          <span className="imported-creative">
            <Layers size={30} />
            <span>Imported creative record</span>
          </span>
        )}
        <span className="image-shade" />
        <span className="ad-status">
          <i />
          {ad.active ? "Active" : "Inactive"}
        </span>
        <span className="ad-platform">
          <PlatformIcon platform={ad.platform} />
        </span>
        <span className="creative-brand">
          {ad.brand.toLowerCase()}
          <span>{ad.title}</span>
        </span>
        {ad.format.toLowerCase().includes("video") && (
          <span className="play-button">
            <Play size={15} fill="currentColor" />
          </span>
        )}
      </button>
      <div className="ad-card-body">
        <span className="angle-tag">{ad.angle}</span>
        <p>{ad.copy}</p>
        <div className="ad-card-stats">
          <span>
            <Heart size={13} />
            {number(ad.engagements)}
          </span>
          <span>
            <Eye size={13} />
            {number(ad.impressions)}
          </span>
          <strong>
            {percent(
              ad.impressions ? (ad.engagements / ad.impressions) * 100 : 0,
            )}{" "}
            <ArrowUpRight size={12} />
          </strong>
        </div>
      </div>
    </article>
  );
}
export function AdDetail({ ad, onClose }: { ad: Ad; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="ad-detail modal"
        role="dialog"
        aria-modal="true"
        aria-label="Creative analysis"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="modal-close icon-button"
          aria-label="Close creative"
        >
          <X size={20} />
        </button>
        <div className="detail-visual">
          {ad.image ? (
            <img src={ad.image} alt={ad.title} />
          ) : (
            <div className="imported-detail">
              <Layers size={50} />
              <p>No creative image supplied</p>
            </div>
          )}
          <span>{ad.brand.toLowerCase()}</span>
        </div>
        <div className="detail-content">
          <div className="eyebrow">CREATIVE INTELLIGENCE</div>
          <h2>{ad.title}</h2>
          <p>{ad.copy}</p>
          <div className="detail-meta">
            <PlatformIcon platform={ad.platform} />
            {ad.platform}
            <span>·</span>
            {ad.format}
          </div>
          <dl>
            <div>
              <dt>Ad angle</dt>
              <dd>{ad.angle}</dd>
            </div>
            <div>
              <dt>Audience</dt>
              <dd>{ad.audience}</dd>
            </div>
            <div>
              <dt>Engagement rate</dt>
              <dd>
                {percent(
                  ad.impressions ? (ad.engagements / ad.impressions) * 100 : 0,
                )}
              </dd>
            </div>
            <div>
              <dt>Observed engagements</dt>
              <dd>{ad.engagements.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Conversions</dt>
              <dd>
                {ad.conversions === null
                  ? "Not available"
                  : ad.conversions.toLocaleString()}
              </dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>
                {ad.source === "sample"
                  ? "Illustrative sample"
                  : "Imported record"}
              </dd>
            </div>
          </dl>
          <div className="inline-note">
            <Info size={16} />
            <span>
              Engagement is an attention signal. It does not establish sales or
              conversion performance.
            </span>
          </div>
          {ad.sourceUrl && (
            <a
              href={ad.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="button secondary"
            >
              View source <ExternalLink size={14} />
            </a>
          )}
        </div>
      </section>
    </div>
  );
}
