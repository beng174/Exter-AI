import { useEffect, useState } from "react";
import {
  ArrowDownToLine,
  CheckCircle2,
  Clock3,
  Code2,
  Database,
  ExternalLink,
  Link2,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { api } from "../lib/api";
import "./connections.css";
interface Connection {
  platform: string;
  status: string;
  missing: string[];
  lastSuccessfulSyncAt: string | null;
  latestMetricDate: string | null;
  lastError: string | null;
  records: number;
  scope: string;
  refreshMode?: string;
  pollIntervalSeconds?: number | null;
  metricDefinition?: string;
  creativeClassification?: string;
}
export function ConnectionPanel({
  brandId,
  onSynced,
  mode = "all",
}: {
  brandId: string;
  onSynced: () => void;
  mode?: "all" | "accounts" | "claude";
}) {
  const [connections, setConnections] = useState<Connection[]>([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [setup, setSetup] = useState<Connection | null>(null),
    [claude, setClaude] = useState(false);
  async function load() {
    try {
      const data = await api<{ connections: Connection[] }>(
        `/api/connections?brandId=${encodeURIComponent(brandId)}`,
      );
      setConnections(data.connections);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    setLoading(true);
    void load();
    const timer = setInterval(() => void load(), 30000);
    return () => clearInterval(timer);
  }, [brandId]);
  async function sync(platform: string) {
    setBusy(platform);
    setError("");
    try {
      await api(`/api/connections/${platform.toLowerCase()}/sync`, { brandId });
      await load();
      onSynced();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  function downloadConfig() {
    const text = JSON.stringify(
      {
        mcpServers: {
          "exter-monitor": {
            command: "/absolute/path/to/node",
            args: [
              "--import",
              "/absolute/path/to/Exter-AI/node_modules/tsx/dist/loader.mjs",
              "/absolute/path/to/Exter-AI/scripts/claude-mcp.ts",
            ],
            env: { EXTER_DB_PATH: "/absolute/path/to/Exter-AI/.data/exter.db" },
          },
        },
      },
      null,
      2,
    );
    const url = URL.createObjectURL(
      new Blob([text], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "exter-claude-config-template.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="cx-stack">
      {mode !== "claude" && (
        <>
          <section className="cx-intro">
            <span>
              <Database size={20} />
            </span>
            <div>
              <h2>Source connections & freshness</h2>
              <p>
                Read-only reporting from authorised owned accounts. Public
                competitor monitoring is a separate data source.
              </p>
            </div>
            <span className="cx-tag">
              {connections.some((c) => c.status === "synced")
                ? "Sync history available"
                : "Setup required"}
            </span>
          </section>
          {error && (
            <p className="error-banner" role="alert">
              {error}
            </p>
          )}
          {loading ? (
            <p className="loading-inline">
              <LoaderCircle className="spin" size={16} />
              Checking source status…
            </p>
          ) : (
            <div className="cx-grid">
              {connections.map((c) => (
                <section className="cx-card" key={c.platform}>
                  <div className="cx-card-head">
                    <span
                      className={`rv-platform-mark rv-platform-${c.platform.toLowerCase()}`}
                    >
                      {c.platform === "Meta"
                        ? "∞"
                        : c.platform === "TikTok"
                          ? "♪"
                          : "G"}
                    </span>
                    <span className={`cx-state cx-${c.status}`}>
                      {c.status === "synced"
                        ? "Last sync succeeded"
                        : c.status === "ready"
                          ? "Ready to sync"
                          : c.status === "not_configured"
                            ? "Not connected"
                            : c.status}
                    </span>
                  </div>
                  <h3>{c.platform}</h3>
                  <p>
                    {c.metricDefinition ||
                      "Owned-account reporting; provider permissions and credentials required."}
                  </p>
                  <dl>
                    <div>
                      <dt>Last successful sync</dt>
                      <dd>
                        {c.lastSuccessfulSyncAt
                          ? new Date(c.lastSuccessfulSyncAt).toLocaleString()
                          : "No successful sync"}
                      </dd>
                    </div>
                    <div>
                      <dt>Latest metric date</dt>
                      <dd>{c.latestMetricDate || "Unavailable"}</dd>
                    </div>
                    <div>
                      <dt>Refresh</dt>
                      <dd>
                        {c.refreshMode === "polling"
                          ? `Every ${c.pollIntervalSeconds || 300} seconds`
                          : "Manual / not running"}
                      </dd>
                    </div>
                  </dl>
                  {c.lastError && <p className="cx-error">{c.lastError}</p>}
                  <p className="cx-classification">
                    {c.creativeClassification ||
                      "Creative styles require supplied annotations; a video is not automatically UGC."}
                  </p>
                  <div className="cx-actions">
                    <button
                      className="button secondary"
                      onClick={() => setSetup(c)}
                    >
                      <Link2 size={13} />
                      Setup details
                    </button>
                    <button
                      className="button primary"
                      onClick={() => sync(c.platform)}
                      disabled={
                        Boolean(busy) ||
                        c.status === "not_configured" ||
                        c.status === "blocked"
                      }
                    >
                      {busy === c.platform ? (
                        <LoaderCircle className="spin" size={13} />
                      ) : (
                        <RefreshCw size={13} />
                      )}
                      Sync
                    </button>
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}
      {mode !== "accounts" && (
        <section className="cx-claude">
          <span className="cx-claude-mark">✳</span>
          <div>
            <span className="eyebrow">ASK IN CLAUDE</span>
            <h2>Your Monitor data. Your Claude workspace.</h2>
            <p>
              Connect the read-only Exter MCP server to Claude Desktop. Ask for
              format comparisons, inspect source ads, then create briefs and
              scripts grounded in the evidence.
            </p>
            <small>
              The downloaded test drive is offline. MCP uses the full
              application’s database; team-wide Claude web access needs a
              hosted, authenticated connector.
            </small>
          </div>
          <button className="button primary" onClick={() => setClaude(true)}>
            <Code2 size={14} />
            Connect Claude
          </button>
        </section>
      )}
      <p className="cx-footnote">
        <Clock3 size={14} />A successful sync is a timestamped observation.
        Platform reporting can lag; polling does not guarantee instant or
        complete market data.
      </p>
      {setup && (
        <div className="modal-backdrop" onClick={() => setSetup(null)}>
          <section
            className="modal cx-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={`${setup.platform} setup`}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="icon-button modal-close"
              onClick={() => setSetup(null)}
              aria-label="Close source setup"
            >
              <X size={18} />
            </button>
            <span className="eyebrow">READ-ONLY DATA ACCESS</span>
            <h2>Connect {setup.platform} reporting</h2>
            <p>
              Authorising means the account owner grants reporting permission
              through the platform. Do not share passwords or put credentials
              into this browser.
            </p>
            <ol>
              <li>
                Obtain approved API access and a reporting token for your own
                advertising account.
              </li>
              <li>
                Configure credentials securely on the full app’s server or in
                environment settings.
              </li>
              <li>
                Return here and sync the selected brand. The first successful
                sync binds this account to that workspace.
              </li>
            </ol>
            <h3>Missing configuration</h3>
            {setup.missing.length ? (
              <ul>
                {setup.missing.map((name) => (
                  <li key={name}>
                    <code>{name}</code>
                  </li>
                ))}
              </ul>
            ) : (
              <p>
                No missing configuration was reported. A real sync still needs
                to confirm provider access.
              </p>
            )}
            <p className="inline-note">
              <ShieldCheck size={16} />
              These connectors report owned accounts. They do not reveal
              competitors’ private spend or conversions. OAuth sign-in
              onboarding is not implemented in this local edition.
            </p>
          </section>
        </div>
      )}
      {claude && (
        <div className="modal-backdrop" onClick={() => setClaude(false)}>
          <section
            className="modal cx-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Connect Claude"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="icon-button modal-close"
              onClick={() => setClaude(false)}
              aria-label="Close Claude setup"
            >
              <X size={18} />
            </button>
            <span className="eyebrow">EXTER MCP · READ ONLY</span>
            <h2>Research here. Create in Claude.</h2>
            <ol>
              <li>
                Run the full Exter app on the same computer as Claude Desktop,
                with its SQLite database available.
              </li>
              <li>
                Download the configuration template. Replace its placeholder
                paths with your actual Node executable and Exter folder.
              </li>
              <li>
                In Claude Desktop, open Settings → Developer → Edit Config.
                Merge the Exter entry and restart Claude.
              </li>
              <li>
                Ask Claude: “Which formats are working in my category on each
                platform? Cite the source ads, then build a creative brief.”
              </li>
            </ol>
            <p className="inline-note">
              This button provides setup instructions; it does not grant access
              to your Claude account. Claude web/team access requires an HTTPS
              connector and workspace authentication.
            </p>
            <button className="button primary" onClick={downloadConfig}>
              <ArrowDownToLine size={14} />
              Download config template
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
