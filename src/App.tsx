import { MetaCollectionPanel } from "./components/MetaCollectionPanel";
import { InfrastructureStatus } from "./components/InfrastructureStatus";
import { BudgetSettings } from "./components/BudgetSettings";
import { GeminiSmokeTest } from "./components/GeminiSmokeTest";
import { LabellingTool } from "./components/LabellingTool";
import { BrandDemoReport } from "./components/BrandDemoReport";
import { DemoPreparation } from "./components/DemoPreparation";
import { PatternLabelControls } from "./components/PatternLabelControls";
import { DemoCollectionControls } from "./components/DemoCollectionControls";
import { BrandLogo } from "./components/BrandLogo";
import { RealWorkspaceView, type RealWorkspacePage } from "./components/RealWorkspaceViews";
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  Command,
  Compass,
  FileChartColumnIncreasing,
  Globe2,
  Layers,
  LoaderCircle,
  Menu,
  MessageSquareText,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings2,
  Sparkles,
  Target,
  UsersRound,
  X,
  Zap,
} from "lucide-react";
import type {
  Ad,
  AdResult,
  Brand,
  Category,
  Dashboard,
  Filters,
  Page,
} from "../shared/types";
import { api } from "./lib/api";
import Overview from "./components/Overview";
import { BrandResearchView } from "./components/BrandResearchView";
import { FormatsView } from "./components/FormatsView";
import { AdCard, AdDetail } from "./components/Creative";
import {
  AudiencesView,
  CompetitorsView,
  CreatorsView,
  ReportsView,
  SourcesView,
} from "./components/ResearchViews";

const navigation: { id: Page; label: string; icon: typeof Compass }[] = [
  { id: "demo", label: "Brand demo", icon: FileChartColumnIncreasing },
  { id: "overview", label: "Overview", icon: Compass },
  { id: "brand", label: "Brands", icon: Globe2 },
  { id: "ads", label: "Creative library", icon: Layers },
  { id: "formats", label: "Creative formats", icon: Activity },
  { id: "competitors", label: "Competitors", icon: BarChart3 },
  { id: "audiences", label: "Audience & voice", icon: Target },
  { id: "creators", label: "Creators", icon: UsersRound },
  { id: "reports", label: "Reports", icon: FileChartColumnIncreasing },
  { id: "labelling", label: "Labelling", icon: ClipboardCheck },
];
const headings: Record<Page, { title: string; subtitle: string }> = {
  demo: { title: "Brand report", subtitle: "" },
  settings: {
    title: "Settings",
    subtitle: "Budgets, website evidence and live tests.",
  },
  labelling: {
    title: "Labelling",
    subtitle: "Human review of source ads, with model predictions hidden.",
  },
  brand: {
    title: "Brands",
    subtitle: "Website observations and source links.",
  },
  formats: {
    title: "Formats",
    subtitle: "Creative formats in the collected sample.",
  },
  overview: {
    title: "Overview",
    subtitle: "Collected ads and creative analysis.",
  },
  ads: {
    title: "Creative library",
    subtitle: "Explore source ads and their analysis.",
  },
  competitors: {
    title: "Competitors",
    subtitle: "Collected competitor ads and source coverage.",
  },
  audiences: {
    title: "Audience & voice",
    subtitle: "Available audience and customer evidence.",
  },
  creators: {
    title: "Creators",
    subtitle: "Attributed creators and public profile evidence.",
  },
  reports: {
    title: "Reports",
    subtitle: "Saved reports and source snapshots.",
  },
  sources: {
    title: "Data sources",
    subtitle: "Public collection and authorised data connections.",
  },
};

function BrandModal({
  brands,
  current,
  onClose,
  onSelect,
  onCreated,
}: {
  brands: Brand[];
  current: string;
  onClose: () => void;
  onSelect: (b: Brand) => void;
  onCreated: (b: Brand) => void;
}) {
  const [name, setName] = useState(""),
    [domain, setDomain] = useState(""),
    [category, setCategory] = useState<Category>("Beauty & skincare"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      onCreated(
        await api<Brand>("/api/brands", {
          name: name.trim(),
          domain: domain.trim(),
          category,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="modal brand-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Brand workspace"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="icon-button modal-close"
          onClick={onClose}
          aria-label="Close workspace selection"
        >
          <X size={19} />
        </button>
        <span className="eyebrow">YOUR WORKSPACES</span>
        <h2>A new perspective starts here.</h2>
        <p>Choose a brand or create a workspace for retained evidence.</p>
        <div className="brand-options">
          {brands.map((b) => (
            <button key={b.id} onClick={() => onSelect(b)}>
              <span
                className="workspace-avatar"
                style={{ background: b.color }}
              >
                {b.initials}
              </span>
              <span>
                <strong>{b.name}</strong>
                <small>
                  {b.category} ·{" "}
                  {b.mode === "demo" ? "Sample data" : "Imported data"}
                </small>
              </span>
              {b.id === current ? (
                <Check size={17} />
              ) : (
                <ChevronRight size={17} />
              )}
            </button>
          ))}
        </div>
        <form onSubmit={create}>
          <h3>Add your own brand</h3>
          <div className="form-row">
            <label>
              Brand name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Your brand"
                required
                maxLength={80}
              />
            </label>
            <label>
              Website <span className="muted">(optional)</span>
              <input
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="yourbrand.com"
                maxLength={180}
              />
            </label>
          </div>
          <label>
            Category
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
            >
              {[
                "Beauty & skincare",
                "Fashion",
                "Wellness",
                "Food & beverage",
                "Home fragrance & gifting",
              ].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <p className="form-hint">
            A new brand starts with an empty workspace. Import real ad data to
            build its competitive landscape.
          </p>
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
          <button
            className="button primary"
            type="submit"
            disabled={busy || !name.trim()}
          >
            {busy ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Plus size={16} />
            )}{" "}
            Create workspace
          </button>
        </form>
      </section>
    </div>
  );
}

function AskPanel({
  brand,
  onClose,
  platform,
  range,
}: {
  brand: Brand;
  onClose: () => void;
  platform: string;
  range: string;
}) {
  const [question, setQuestion] = useState(""),
    [history, setHistory] = useState<
      { question: string; answer: string; sources: string[] }[]
    >([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, busy]);
  async function ask(text: string) {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError("");
    setQuestion("");
    try {
      const r = await api<{ answer: string; sources: string[] }>("/api/ask", {
        brandId: brand.id,
        question: text,
        platform,
        range: Number(range),
      });
      setHistory((h) => [...h, { question: text, ...r }]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="ask-backdrop" onClick={onClose}>
      <aside
        className="ask-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Ask your intelligence"
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <span className="ask-icon">
            <Sparkles size={18} />
          </span>
          <div>
            <h2>Ask your intelligence</h2>
            <p>{brand.name} workspace</p>
          </div>
          <button
            className="icon-button"
            aria-label="Close assistant"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        <div className="ask-body">
          <span className="mini-tag">Data-grounded research assistant</span>
          <h3>
            A fresh perspective,
            <br />
            one question away.
          </h3>
          <p className="muted">
            Explore your workspace’s angles, competitors, reviews, and creators.
          </p>
          <div className="suggested-questions">
            {[
              "Which ad formats work best in my category on each platform?",
              "How do we compare with competitors?",
              "Which creators fit our brand voice?",
              "What are customers saying?",
            ].map((q) => (
              <button disabled={busy} key={q} onClick={() => ask(q)}>
                {q}
                <ArrowUpRight size={14} />
              </button>
            ))}
          </div>
          {history.map((m, i) => (
            <div className="chat-pair" key={i}>
              <div className="chat-question">{m.question}</div>
              <div className="chat-answer">
                <Sparkles size={16} />
                <div>
                  {m.answer}
                  <small>Sources: {m.sources.join(" · ")}</small>
                </div>
              </div>
            </div>
          ))}
          {busy && (
            <p className="loading-inline">
              <LoaderCircle size={16} className="spin" />
              Reading workspace data…
            </p>
          )}
          {error && (
            <p role="alert" className="error-text">
              {error}
            </p>
          )}
          <div ref={bottom} />
        </div>
        <footer>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(question);
            }}
          >
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask about your landscape…"
              aria-label="Your research question"
              maxLength={500}
            />
            <button
              disabled={busy || !question.trim()}
              aria-label="Send question"
            >
              <Send size={16} />
            </button>
          </form>
          <p>
            Rule-based summaries ·{" "}
            {brand.mode === "demo" ? "Sample data" : "Imported data"} · No live
            LLM connected
          </p>
        </footer>
      </aside>
    </div>
  );
}

function AdLibrary({
  brandId,
  filters,
  onAd,
  angles,
  onSearch,
}: {
  brandId: string;
  filters: Filters;
  onAd: (ad: Ad) => void;
  angles: string[];
  onSearch: (value: string) => void;
}) {
  const [result, setResult] = useState<AdResult | null>(null),
    [page, setPage] = useState(1),
    [angle, setAngle] = useState("all"),
    [contentSource, setContentSource] = useState("all"),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  useEffect(() => {
    setPage(1);
  }, [
    brandId,
    filters.platform,
    filters.range,
    filters.search,
    angle,
    contentSource,
  ]);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const q = new URLSearchParams({
      brandId,
      ...filters,
      page: String(page),
      angle,
      contentSource,
    });
    api<AdResult>(`/api/ads?${q}`)
      .then((r) => {
        if (!cancelled) setResult(r);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    brandId,
    filters.platform,
    filters.range,
    filters.search,
    page,
    angle,
    contentSource,
  ]);
  return (
    <section>
      <div className="mobile-library-search">
        <Search size={15} />
        <input
          aria-label="Search this ad library"
          value={filters.search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search brands, angles, or audiences…"
        />
      </div>
      <div className="library-toolbar">
        <label>
          Content source
          <select
            aria-label="Content source"
            value={contentSource}
            onChange={(e) => setContentSource(e.target.value)}
          >
            <option value="all">Paid & organic</option>
            <option value="paid">Paid ads</option>
            <option value="organic">Organic posts</option>
          </select>
        </label>
        <span>
          <strong>{result?.total.toLocaleString() || "0"}</strong> creatives in
          your landscape
        </span>
        <label>
          Ad angle
          <select value={angle} onChange={(e) => setAngle(e.target.value)}>
            <option value="all">All angles</option>
            {angles.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </label>
      </div>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <div className="loading-state">
          <LoaderCircle className="spin" />
          Curating your creative library…
        </div>
      ) : result?.items.length ? (
        <div className="creative-grid library-grid">
          {result.items.map((ad) => (
            <AdCard ad={ad} key={ad.id} onOpen={onAd} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <Search />
          <h3>No creatives found</h3>
          <p>
            Try a different platform, date range, or search. New workspaces need
            an ad-data import.
          </p>
        </div>
      )}
      {result && result.pages > 1 && (
        <div className="pagination">
          <span>
            Page {result.page} of {result.pages}
          </span>
          <div>
            <button
              className="button secondary"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ArrowLeft size={15} />
              Previous
            </button>
            <button
              className="button secondary"
              disabled={page >= result.pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
              <ArrowRight size={15} />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function WorkspaceApp() {
  const [brands, setBrands] = useState<Brand[]>([]),
    [brandId, setBrandId] = useState(
      () => {
        const requested = new URLSearchParams(window.location.search).get("brandId");
        return requested && /^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,119}$/.test(requested) ? requested : localStorage.getItem("exter-brand") || "valentte";
      },
    ),
    [dashboard, setDashboard] = useState<Dashboard | null>(null),
    [page, setPage] = useState<Page>(() => {
      const requested = new URLSearchParams(window.location.search).get("view");
      if (requested && Object.hasOwn(headings, requested)) return requested as Page;
      return (window as Window & { __EXTER_RESEARCH_BRAND__?: string })
        .__EXTER_RESEARCH_BRAND__ === localStorage.getItem("exter-brand")
        ? "brand"
        : "overview";
    }),
    [platform, setPlatform] = useState("all"),
    [range, setRange] = useState("30"),
    [search, setSearch] = useState(""),
    [refresh, setRefresh] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [brandOpen, setBrandOpen] = useState(false),
    [askOpen, setAskOpen] = useState(false),
    [menuOpen, setMenuOpen] = useState(false),
    [ad, setAd] = useState<Ad | null>(null),
    [helpOpen, setHelpOpen] = useState(false),
    [exportBusy, setExportBusy] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const selectedBrand = brands.find(item => item.id === brandId);
  const demoEnabled = new URLSearchParams(window.location.search).get("demo") === "1";
  const isRealWorkspacePage = (selectedBrand?.mode === "imported" || !demoEnabled) && ["overview", "ads", "formats", "brand", "creators", "competitors", "audiences"].includes(page);
  useEffect(() => {
    api<Brand[]>("/api/brands")
      .then((list) => {
        list = list.filter(item => item.mode !== "demo" || new URLSearchParams(window.location.search).get("demo") === "1");
        setBrands(list);
        if (!list.some((b) => b.id === brandId) && list.length)
          setBrandId((list.find(item => item.mode === "imported" && item.domain.replace(/^www\./, "") === "valentte.com") || list[0]).id);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);
  useEffect(() => {
    let cancelled = false;
    localStorage.setItem("exter-brand", brandId);
    if (page === "demo" || page === "settings" || page === "labelling" || isRealWorkspacePage) { setDashboard(null); setLoading(false); setError(""); return; }
    setLoading(true);
    setError("");
    api<Dashboard>(
      `/api/dashboard?${new URLSearchParams({ brandId, platform, range })}`,
    )
      .then((r) => {
        if (!cancelled) setDashboard(r);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [brandId, platform, range, refresh, page, isRealWorkspacePage]);
  useEffect(() => {
    if (page !== "settings") return;
    const id = window.location.hash.slice(1);
    if (!["brand-demo-preparation", "pattern-labels", "demo-collection", "monthly-budgets", "gemini-smoke-test"].includes(id)) return;
    const frame = requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start" }));
    return () => cancelAnimationFrame(frame);
  }, [page, brandId]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape") {
        setAd(null);
        setAskOpen(false);
        setBrandOpen(false);
        setHelpOpen(false);
        setMenuOpen(false);
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const modalIsOpen = brandOpen || askOpen || Boolean(ad) || helpOpen;
  useEffect(() => {
    if (!modalIsOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    if (!dialog) return;
    const selector =
      'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]';
    const focusables = () =>
      Array.from(dialog.querySelectorAll<HTMLElement>(selector)).filter(
        (el) => el.getClientRects().length > 0,
      );
    focusables()[0]?.focus();
    function trap(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const elements = focusables();
      const first = elements[0],
        last = elements.at(-1);
      if (!first) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, [modalIsOpen]);
  const brand = selectedBrand || (dashboard?.brand.id === brandId ? dashboard.brand : undefined);
  function navigate(next: Page) {
    setPage(next);
    setMenuOpen(false);
    setSearch("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function select(b: Brand) {
    setBrandId(b.id);
    setBrandOpen(false);
    setSearch("");
    setPage(b.domain === "valentte.com" ? "brand" : "overview");
    setDashboard(null);
  }
  async function exportReport() {
    setExportBusy(true);
    try {
      const r = await api<{ id: string }>("/api/reports", { brandId });
      const link = document.createElement("a");
      link.href = `/api/reports/${r.id}/download`;
      document.body.append(link);
      link.click();
      link.remove();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExportBusy(false);
    }
  }
  const title = headings[page];
  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
        <a className="wordmark" href="/" aria-label="Exter Media home">
          <BrandLogo />
        </a>
        <div className="workspace-label">WORKSPACE</div>
        <button className="workspace-switch" onClick={() => setBrandOpen(true)}>
          <span
            className="workspace-avatar"
            style={{ background: brand?.color || "#ddd4c6" }}
          >
            {brand?.initials || "R"}
          </span>
          <span>
            <strong>{brand?.name || "Your brand"}</strong>
            <small>Brand intelligence</small>
          </span>
          <ChevronDown size={15} />
        </button>
        <div className="nav-label">INTELLIGENCE</div>
        <nav aria-label="Main navigation">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`nav-item ${page === id ? "active" : ""}`}
              onClick={() => navigate(id)}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className={`nav-item ${page === "settings" ? "active" : ""}`}
            onClick={() => navigate("settings")}
          >
            <Settings2 size={18} />
            <span>Budgets & tests</span>
          </button>
          <button
            className={`nav-item ${page === "sources" ? "active" : ""}`}
            onClick={() => navigate("sources")}
          >
            <Globe2 size={18} />
            <span>Data sources</span>
            <span className="source-dot" />
          </button>
          <button className="nav-item" onClick={() => setHelpOpen(true)}>
            <CircleHelp size={18} />
            <span>Help & getting started</span>
            <ArrowUpRight size={14} />
          </button>
          <div className="user-profile">
            <span>EW</span>
            <div>
              <strong>Exter workspace</strong>
              <small>Local research edition</small>
            </div>
            <button
              className="icon-button"
              aria-label="Workspace settings"
              onClick={() => navigate("settings")}
            >
              <Settings2 size={16} />
            </button>
          </div>
        </div>
      </aside>
      {menuOpen && (
        <div className="mobile-scrim" onClick={() => setMenuOpen(false)} />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Toggle navigation"
            >
              <Menu size={21} />
            </button>
            <span>Intelligence</span>
            <ChevronRight size={14} />
            <strong>
              {page === "sources"
                ? "Data sources"
                : page === "settings"
                  ? "Budgets & tests"
                : navigation.find((n) => n.id === page)?.label}
            </strong>
          </div>
          <div className="topbar-right">
            {page !== "demo" && <form
              className="global-search"
              onSubmit={(e) => {
                e.preventDefault();
                setPage("ads");
              }}
            >
              <Search size={15} />
              <input
                ref={searchRef}
                aria-label="Search ads and brands"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  if (e.target.value) setPage("ads");
                }}
                placeholder="Search your landscape…"
              />
              <kbd>
                <Command size={10} /> K
              </kbd>
            </form>}
            <span className="mode-badge">
              <i />
              {page === "demo" ? "Read-only report" : page === "brand"
                ? "Website research"
                : brand?.mode === "imported"
                  ? "Imported workspace"
                  : "Sample workspace"}
            </span>
            <button
              className="top-avatar"
              aria-label="Manage workspace"
              onClick={() => setBrandOpen(true)}
            >
              E
            </button>
          </div>
        </header>
        <main>
          {page === "sources" && <MetaCollectionPanel key={brandId} workspaceId={brandId} />}
          {page !== "demo" && <div className="page-title-row">
            <div>
              <div className="page-eyebrow">
                <span />
                {brand?.category || "CREATIVE INTELLIGENCE"}
                <span className="eyebrow-divider">/</span>
                {brand?.name || "YOUR BRAND"}
              </div>
              <h1>{page === "brand" && brand ? brand.name : title.title}</h1>
              <p>{title.subtitle}</p>
            </div>
            {page !== "settings" && page !== "labelling" && !isRealWorkspacePage && <div className="title-actions">
              <button
                className="button secondary export-button"
                title="Generate a report covering the last 30 days across all platforms"
                onClick={exportReport}
                disabled={exportBusy || !dashboard}
              >
                {exportBusy ? (
                  <LoaderCircle size={15} className="spin" />
                ) : (
                  <ArrowDownToLine size={15} />
                )}
                Export report
              </button>
              <button
                className="button primary"
                onClick={() => setAskOpen(true)}
                disabled={!brand}
              >
                <Sparkles size={15} />
                Ask Exter
              </button>
            </div>}
          </div>}
          {page !== "settings" && page !== "demo" && <div className="context-toolbar">
            <div className="brand-context">
              <span className="tiny-brand" style={{ background: brand?.color }}>
                {brand?.initials || "R"}
              </span>
              <strong>{brand?.name || "Your brand"}</strong>
              <span className="vertical-rule" />
              <span>
                {isRealWorkspacePage ? "Saved public evidence" : page === "brand"
                  ? "Website and source research"
                  : `${dashboard?.metrics.brands || 0} brands in landscape`}
              </span>
              <button
                className="icon-button"
                aria-label="Change brand workspace"
                onClick={() => setBrandOpen(true)}
              >
                <ChevronDown size={14} />
              </button>
            </div>
            {page !== "brand" && page !== "labelling" && !isRealWorkspacePage && (
              <div className="filter-group">
                <label className="platform-select">
                  <Globe2 size={14} />
                  <select
                    aria-label="Filter platform"
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value)}
                  >
                    <option value="all">All platforms</option>
                    <option>Meta</option>
                    <option>TikTok</option>
                    <option>Google</option>
                    {["Instagram", "Facebook", "LinkedIn", "X", "YouTube"].map(
                      (p) => (
                        <option key={p}>{p}</option>
                      ),
                    )}
                  </select>
                </label>
                <label className="date-select">
                  <CalendarDays size={14} />
                  <select
                    aria-label="Date range"
                    value={range}
                    onChange={(e) => setRange(e.target.value)}
                  >
                    <option value="7">Last 7 days</option>
                    <option value="30">Last 30 days</option>
                    <option value="90">Last 90 days</option>
                  </select>
                </label>
                <button
                  className="icon-button refresh-button"
                  aria-label="Refresh workspace data"
                  onClick={() => setRefresh((r) => r + 1)}
                  disabled={loading}
                >
                  <RefreshCw size={15} className={loading ? "spin" : ""} />
                </button>
              </div>
            )}
          </div>}
          {page !== "settings" && page !== "labelling" && page !== "demo" && !isRealWorkspacePage && <div className="data-status">
            <span>
              <i className={brand?.mode === "imported" ? "green" : ""} />
              {page === "brand"
                ? "Public website evidence"
                : brand?.mode === "imported"
                  ? "Your imported data"
                  : "You’re exploring sample data"}
              <span className="status-separator">·</span>
              {page === "brand"
                ? "Source timestamps shown below; no ad-performance result implied."
                : brand?.mode === "imported"
                  ? dashboard?.sourceStatus?.connected
                    ? "Saved provider observations; see Data sources for sync and reporting lag."
                    : "Saved data only; no verified live feeds connected."
                  : "Illustrative insights, not live market results."}
            </span>
            <button onClick={() => navigate("sources")}>
              {brand?.mode === "imported"
                ? "Manage sources"
                : "Connect your data"}
              <ArrowRight size={13} />
            </button>
          </div>}
          {error && (
            <div className="error-banner" role="alert">
              {error}
              <button onClick={() => setRefresh((r) => r + 1)}>
                Try again
              </button>
            </div>
          )}
          {page === "settings" ? (
            <div className="page-content">
              <nav className="settings-shortcuts" aria-label="Settings sections">
                <a href="#brand-demo-preparation">Website evidence & client demo</a>
                <a href="#pattern-labels">Pattern labels</a>
                <a href="#demo-collection">Competitor collection</a>
                <a href="#monthly-budgets">Monthly budgets</a>
                <a href="#gemini-smoke-test">Gemini smoke test</a>
              </nav>
              <DemoPreparation key={brandId} brandId={brandId} onBrandChange={setBrandId} />
              <PatternLabelControls key={`pattern-labels-${brandId}`} brandId={brandId} />
              <DemoCollectionControls key={`collection-${brandId}`} brandId={brandId} />
              <BudgetSettings />
              <GeminiSmokeTest />
            </div>
          ) : page === "demo" ? (
            <div key={brandId} className="page-content"><a className="button secondary" href={`/demo/${encodeURIComponent(brandId)}`} target="_blank" rel="noopener noreferrer">Open client demo view</a><BrandDemoReport brandId={brandId} /></div>
          ) : page === "labelling" ? (
            <div key={brandId} className="page-content"><LabellingTool brandId={brandId} /></div>
          ) : isRealWorkspacePage ? (
            <div key={`${brandId}:${page}:${refresh}`} className="page-content"><RealWorkspaceView brands={brands} onSelectBrand={setBrandId} brandId={brandId} view={page as RealWorkspacePage} onOpenSettings={() => navigate("settings")} onOpenSources={() => navigate("sources")} /></div>
          ) : loading && !dashboard ? (
            <div className="loading-state main-loading">
              <LoaderCircle className="spin" size={23} />
              <h3>Bringing your landscape into focus…</h3>
              <p>Reading ads, audiences, and creative signals.</p>
            </div>
          ) : (
            dashboard && (
              <div key={brandId} className="page-content">
                {page === "brand" && (
                  <BrandResearchView
                    brandId={brandId}
                    onUpdated={() => setRefresh((r) => r + 1)}
                  />
                )}
                {page === "overview" && (
                  <Overview
                    dashboard={dashboard}
                    onPage={navigate}
                    onAd={setAd}
                  />
                )}{" "}
                {page === "ads" && (
                  <AdLibrary
                    brandId={brandId}
                    filters={{ platform, range, search }}
                    onAd={setAd}
                    angles={dashboard.angles.map((a) => a.name)}
                    onSearch={setSearch}
                  />
                )}{" "}
                {page === "formats" && (
                  <FormatsView
                    key={refresh}
                    brandId={brandId}
                    platform={platform}
                    range={range}
                    onAd={setAd}
                  />
                )}
                {page === "competitors" && (
                  <CompetitorsView dashboard={dashboard} />
                )}{" "}
                {page === "audiences" && (
                  <AudiencesView dashboard={dashboard} />
                )}{" "}
                {page === "creators" && (
                  <CreatorsView dashboard={dashboard} brandId={brandId} />
                )}{" "}
                {page === "reports" && (
                  <ReportsView
                    brandId={brandId}
                    brandName={brand?.name || ""}
                    mode={dashboard.mode}
                  />
                )}{" "}
                {page === "sources" && brand && (
                  <SourcesView
                    brand={brand}
                    onImported={() => {
                      setRefresh((r) => r + 1);
                      api<Brand[]>("/api/brands").then(setBrands);
                    }}
                  />
                )}
              </div>
            )
          )}
          {page !== "demo" && <footer className="main-footer">
            <span className="footer-logo">Exter Media</span>
            <details className="workspace-data-note"><summary><CircleHelp size={14} /> About this data</summary>
              <p>{brand?.mode === "imported" ? "Saved source observations. Missing data is shown as unavailable; ad counts and creative structure do not establish performance." : "Illustrative sample workspace. These records are not live market data."}</p>
              <InfrastructureStatus />
            </details>
          </footer>}
        </main>
      </div>
      {brandOpen && (
        <BrandModal
          brands={brands}
          current={brandId}
          onClose={() => setBrandOpen(false)}
          onSelect={select}
          onCreated={(b) => {
            setBrands((list) => [
              ...list.filter((item) => item.id !== b.id),
              b,
            ]);
            select(b);
          }}
        />
      )}
      {askOpen && brand && (
        <AskPanel
          brand={brand}
          onClose={() => setAskOpen(false)}
          platform={platform}
          range={range}
        />
      )}{" "}
      {ad && <AdDetail ad={ad} onClose={() => setAd(null)} />}{" "}
      {helpOpen && (
        <div className="modal-backdrop" onClick={() => setHelpOpen(false)}>
          <section
            className="modal help-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Getting started"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              onClick={() => setHelpOpen(false)}
              aria-label="Close help"
            >
              <X size={20} />
            </button>
            <span className="eyebrow">WELCOME TO EXTER</span>
            <h2>A clearer view of your market.</h2>
            <div className="help-step">
              <span>01</span>
              <div>
                <h3>Find your perspective</h3>
                <p>
                  Choose a brand or create your own workspace with
                  the brand selector.
                </p>
              </div>
            </div>
            <div className="help-step">
              <span>02</span>
              <div>
                <h3>Bring in the evidence</h3>
                <p>
                  Import authorised ad records in Data sources. Sample records
                  are excluded once real data is imported.
                </p>
              </div>
            </div>
            <div className="help-step">
              <span>03</span>
              <div>
                <h3>Turn signals into direction</h3>
                <p>
                  Compare ad angles, explore audience signals, shortlist
                  illustrative creators, and export a research report.
                </p>
              </div>
            </div>
            <p className="inline-note">
              This is a local, single-workspace MVP. Live integrations,
              multi-user access, and production security are not yet configured.
            </p>
            <button
              className="button primary"
              onClick={() => {
                setHelpOpen(false);
                navigate("sources");
              }}
            >
              Explore data sources
              <ArrowRight size={15} />
            </button>
          </section>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const match = /^\/demo\/([^/]+)\/?$/.exec(window.location.pathname);
  if (match) {
    let brandId: string;
    try { brandId = decodeURIComponent(match[1]); } catch { return <main>Invalid brand report link.</main>; }
    return <main className="client-demo-shell"><div className="client-demo-wordmark"><BrandLogo /></div><BrandDemoReport brandId={brandId} /></main>;
  }
  return <WorkspaceApp />;
}
