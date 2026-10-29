import { engagementObservation } from "../../shared/engagement";
import { classifyCreativeFormats } from "../../shared/formats";
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
      {(
        {
          Meta: "∞",
          TikTok: "♪",
          Google: "G",
          Instagram: "◎",
          Facebook: "f",
          LinkedIn: "in",
          X: "X",
          YouTube: "▶",
        } as Record<string, string>
      )[platform] || platform.slice(0, 1)}
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
          {ad.deliveryStatus === "unknown"
            ? "Status unavailable"
            : ad.active
              ? "Active"
              : "Inactive"}
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
        <div className="creative-tags">
          {classifyCreativeFormats(ad).map((tag) => (
            <span className="angle-tag creative-format-tag" key={tag}>
              {tag}
            </span>
          ))}
          <span className="angle-tag">{ad.angle}</span>
        </div>
        <p>{ad.copy}</p>
        <div className="ad-card-stats">
          <span>
            <Heart size={13} />
            {ad.metricsAvailable===false?"—":number(ad.engagements)}
          </span>
          <span>
            <Eye size={13} />
            {ad.metricsAvailable===false?"—":number(engagementObservation(ad).denominator)}
          </span>
          <strong>
            {engagementObservation(ad).rate===null?'Unavailable':percent(engagementObservation(ad).rate!)}{" "}
            <ArrowUpRight size={12} />
          </strong>
        </div>
      </div>
    </article>
  );
}
export { AdIntelligence as AdDetail } from "./AdIntelligence";
