# Ask Claude using Exter Monitor data

Exter provides a real, read-only **Model Context Protocol (MCP)** server. Claude can query saved brand workspaces, compare creative formats by platform, inspect source ads and available structured analysis, and turn evidence into draft creative briefs. There is no separate LLM API key in this connection: Claude is the MCP client and supplies its own model. You still need access to a Claude client that supports local MCP servers.

## What is connected

- `list_workspaces`: resolve a brand to its workspace and category.
- `compare_ad_formats`: compare UGC, influencer, static, before-and-after, live-photo, review/testimonial and relevant native formats within Meta, TikTok and Google. Engagement and owned conversion/CPA metrics are distinct.
- `search_ads`: inspect up to 20 source records per call, with IDs and provenance.
- `get_ad_analysis`: read an ad's saved structured analysis if present. Missing visual concepts, audience inference and attention maps remain unavailable.
- `get_brand_context`: retrieve observed competitor, audience, voice, review and creator evidence.
- `source_status`: inspect cached live-origin observation timestamps; it does not start a sync or prove a polling process is running.
- Prompts `creative_format_brief` and `create_creative_brief`: guide Claude through evidence-based format comparison and platform-specific creative hypotheses/scripts for human review.

Every tool is marked read-only. None creates ads, sends outreach, changes budgets, publishes content or syncs providers. Imported content is treated as untrusted source material, never as instructions. The model must state metric, coverage, dates, provenance and missing data rather than imply a live result.

## Claude Desktop setup

Use the **full application source**, not the single HTML test drive. Browser-only test-drive data is stored separately and is not available to the SQLite MCP server.

1. Install Node.js 24+ and run `npm ci` in your Exter checkout.
2. Start the app once (`npm run dev`) so `.data/exter.db` exists. Import authorised data or configure and sync the supported live account connectors. Sample data stays explicitly labelled.
3. In Claude Desktop, open **Settings → Developer → Edit Config** and add an MCP server entry like this, using actual absolute paths on your computer:

```json
{
  "mcpServers": {
    "exter-monitor": {
      "command": "/absolute/path/to/node",
      "args": [
        "--import",
        "/absolute/path/to/Exter-AI/node_modules/tsx/dist/loader.mjs",
        "/absolute/path/to/Exter-AI/scripts/claude-mcp.ts"
      ],
      "env": {
        "EXTER_DB_PATH": "/absolute/path/to/Exter-AI/.data/exter.db"
      }
    }
  }
}
```

On Windows use escaped backslashes in JSON or forward-slash absolute paths. Use the real Node executable path returned by your installation. This example contains file paths only, not tokens. The `env` entry is optional if using the checkout's default `.data/exter.db`; explicit absolute paths are easier to diagnose.

4. Fully quit and reopen Claude Desktop. Confirm the Exter tools are listed before relying on a response.
5. Ask, for example:

> For Rhode's skincare category, which creative formats earned the highest observed engagement on Meta, TikTok and Google in the last 30 days? Compare each platform separately. Show sample sizes, missing classifications, source timestamps and supporting ad IDs. Tell me when the data is sample or imported.

> Using only my owned Meta records, compare UGC, influencer, static, before-and-after, live-photo and review creatives by reported CPA. Do not infer competitor conversions.

> Build a creative brief from the leading observed formats. Separate source-backed findings from proposed hooks, creator scripts and creative propositions. Cite the source ad IDs and flag any missing visual analysis.

MCP reads the current database on each call, so newly committed sync/import records become available without exporting a report. The app's database file must be accessible to the process Claude launches. The web app does not need to remain open for cached-data queries, but an authorised sync process must run to refresh provider data.

## Verify the server

From the repository root, start the stdio process with `npm run mcp` (or `node --import tsx scripts/claude-mcp.ts`). It waits for MCP JSON-RPC messages on stdin; it is not an HTTP page or interactive terminal chat. Protocol messages use stdout; diagnostics and Node warnings use stderr. A missing database produces an actionable error and **does not create or seed a new database**.

Automated tests in `tests/mcp.test.ts` use the official SDK client for a real stdio handshake and in-memory MCP calls. They verify per-platform format results, source IDs, validated scope, bounded records, read-only annotations, missing-analysis handling and that stdio queries preserve stored records.

## Claude web and team-wide access

This implementation supplies a local stdio server for Claude Desktop. **It does not publish a remote connector or connect a Claude team automatically.** Claude web/team deployment needs an approved HTTPS MCP endpoint, client-compatible authentication (typically OAuth), user/workspace access controls, an accessible data store, and administrator configuration. A public, unauthenticated endpoint over this single-workspace app is not an acceptable shortcut.

No authorised provider accounts or Claude client were connected during development. SDK tests establish that the tools and transport work; they do not establish your Claude workspace connection or live provider access. Public competitor engagement cannot establish competitor conversions, and a saved observation is not a real-time performance feed.
