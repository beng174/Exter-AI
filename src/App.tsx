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
  { id: "overview", label: "Overview", icon: Compass },
  { id: "ads", label: "Content library", icon: Layers },
  { id: "formats", label: "Creative formats", icon: Activity },
  { id: "competitors", label: "Competitors", icon: BarChart3 },
  { id: "audiences", label: "Audience & voice", icon: Target },
  { id: "creators", label: "Creator discovery", icon: UsersRound },
  { id: "reports", label: "Reports", icon: FileChartColumnIncreasing },
];
const headings: Record<Page, { title: string; subtitle: string }> = {
  formats: {
    title: "The format behind the performance.",
    subtitle:
      "Compare UGC, influencer, static, reviews and native creative formats within each platform.",
  },
  overview: {
    title: "A wider lens. A clearer advantage.",
    subtitle: "Your competitive landscape, brought into focus.",
  },
  ads: {
    title: "Good creative leaves clues.",
    subtitle: "Explore the ads, messages, and angles earning attention.",
  },
  competitors: {
    title: "Know who’s setting the pace.",
    subtitle: "Compare your brand with the rest of your landscape.",
  },
  audiences: {
    title: "Understand the people behind the numbers.",
    subtitle:
      "Turn audience angles and customer conversations into creative direction.",
  },
  creators: {
    title: "The right voices. Your next chapter.",
    subtitle: "Discover creators whose audience and style fit your brand.",
  },
  reports: {
    title: "From intelligence to your next move.",
    subtitle: "Clear, shareable snapshots of your competitive landscape.",
  },
  sources: {
    title: "Better inputs. Sharper intelligence.",
    subtitle: "Bring your authorised data into one connected workspace.",
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
        <p>Choose a sample landscape or start researching your brand.</p>
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

export default function App() {
  const [brands, setBrands] = useState<Brand[]>([]),
    [brandId, setBrandId] = useState(
      () => localStorage.getItem("exter-brand") || "rhode",
    ),
    [dashboard, setDashboard] = useState<Dashboard | null>(null),
    [page, setPage] = useState<Page>("overview"),
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
  useEffect(() => {
    api<Brand[]>("/api/brands")
      .then((list) => {
        setBrands(list);
        if (!list.some((b) => b.id === brandId) && list.length)
          setBrandId(list[0].id);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);
  useEffect(() => {
    let cancelled = false;
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
    localStorage.setItem("exter-brand", brandId);
    return () => {
      cancelled = true;
    };
  }, [brandId, platform, range, refresh]);
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
  const brand = dashboard?.brand || brands.find((b) => b.id === brandId);
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
    setPage("overview");
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
        <a className="wordmark" href="/" aria-label="Exter home">
          <span className="logo-symbol">
            <i />
            <i />
            <i />
          </span>
          exter<span className="logo-period">.</span>
          <span className="ai-label">AI</span>
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
              {id === "creators" && <span className="nav-new">NEW</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="workspace-promo">
            <span>
              <Sparkles size={16} /> A little unfair advantage.
            </span>
            <p>
              Big-picture thinking.
              <br />
              Grounded in the details.
            </p>
            <button onClick={() => setAskOpen(true)}>
              Meet your research assistant
              <ArrowUpRight size={14} />
            </button>
          </div>
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
              onClick={() => setBrandOpen(true)}
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
                : navigation.find((n) => n.id === page)?.label}
            </strong>
          </div>
          <div className="topbar-right">
            <form
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
            </form>
            <span className="mode-badge">
              <i />
              {brand?.mode === "imported"
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
          <div className="page-title-row">
            <div>
              <div className="page-eyebrow">
                <span />
                {brand?.category || "CREATIVE INTELLIGENCE"}
                <span className="eyebrow-divider">/</span>
                {brand?.name || "YOUR BRAND"}
              </div>
              <h1>{title.title}</h1>
              <p>{title.subtitle}</p>
            </div>
            <div className="title-actions">
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
            </div>
          </div>
          <div className="context-toolbar">
            <div className="brand-context">
              <span className="tiny-brand" style={{ background: brand?.color }}>
                {brand?.initials || "R"}
              </span>
              <strong>{brand?.name || "Your brand"}</strong>
              <span className="vertical-rule" />
              <span>{dashboard?.metrics.brands || 0} brands in landscape</span>
              <button
                className="icon-button"
                aria-label="Change brand workspace"
                onClick={() => setBrandOpen(true)}
              >
                <ChevronDown size={14} />
              </button>
            </div>
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
          </div>
          <div className="data-status">
            <span>
              <i className={brand?.mode === "imported" ? "green" : ""} />
              {brand?.mode === "imported"
                ? "Your imported data"
                : "You’re exploring sample data"}
              <span className="status-separator">·</span>
              {brand?.mode === "imported"
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
          </div>
          {error && (
            <div className="error-banner" role="alert">
              {error}
              <button onClick={() => setRefresh((r) => r + 1)}>
                Try again
              </button>
            </div>
          )}
          {loading && !dashboard ? (
            <div className="loading-state main-loading">
              <LoaderCircle className="spin" size={23} />
              <h3>Bringing your landscape into focus…</h3>
              <p>Reading ads, audiences, and creative signals.</p>
            </div>
          ) : (
            dashboard && (
              <div key={brandId} className="page-content">
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
          <footer className="main-footer">
            <span>
              <span className="footer-logo">exter.</span>A little perspective
              changes everything.
            </span>
            <span>
              {dashboard?.mode === "demo"
                ? "Sample dataset"
                : "Imported dataset"}
              <span className="status-separator">·</span>
              {dashboard?.sourceStatus?.connected
                ? `Source last synced ${new Date(dashboard.sourceStatus.lastSuccessfulSyncAt!).toLocaleTimeString()}`
                : "No verified live feeds connected"}
            </span>
          </footer>
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
                  Switch between sample brands or create your own workspace with
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
