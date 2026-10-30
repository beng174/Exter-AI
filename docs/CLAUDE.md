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

## Mac quick start

Install Node.js **24 or newer** and Claude Desktop first. In Terminal:

```sh
git clone --branch exter-test-drive https://github.com/beng174/Exter-AI.git
cd Exter-AI
npm ci
npm run claude:setup
```

The setup helper adds Exter to `~/Library/Application Support/Claude/claude_desktop_config.json`, preserves existing MCP entries and other settings, and backs up a previous configuration before changing it. It prepares the local database with the packaged real Valentte research/ad-library snapshot. It does not require a Claude API key or client advertising-account access and does not start continuous public collection.

Fully quit and reopen Claude Desktop, confirm the Exter tools are available, then ask:

> What real Valentte ads are saved in Exter? Summarise the available media and delivery dates, cite the ad-library source links, and explain which engagement metrics are missing.

The helper's configuration-preservation behavior is tested using temporary configuration files. Installation has not been verified on an actual Mac in this environment. If your Claude version or organisation manages its configuration differently, use the manual setup below.

## Claude Desktop setup

Use the **full application source**, not the single HTML test drive. Browser-only test-drive data is stored separately and is not available to the SQLite MCP server.

1. Install Node.js 24+ and run `npm ci` in your Exter checkout.
2. Start the app once (`npm run dev`) so `.data/exter.db` exists. Collect/import public records, including the documented Valentte ad-library sample, or import other authorised data. Private advertising-account connections are optional. Sample data stays explicitly labelled.
3. For a manual local MCP configuration, open Claude Desktop's **Settings → Developer → Edit Config**, where available in your version, and add an entry like this using actual absolute paths on your computer:

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

> Inspect Valentte's saved Meta Ad Library evidence. Summarise available creative media, delivery dates and messages. Distinguish the bounded sample from all active ads. If engagement counts or the denominator are missing, say the engagement rate is unavailable and do not choose a performance winner.

> Build a creative brief from the leading observed formats. Separate source-backed findings from proposed hooks, creator scripts and creative propositions. Cite the source ad IDs and flag any missing visual analysis.

MCP reads the current database on each call, so newly committed sync/import records become available without exporting a report. The app's database file must be accessible to the process Claude launches. The web app does not need to remain open for cached-data queries, but an authorised sync process must run to refresh provider data.

Current Claude Desktop versions also support packaged local extensions through **Settings → Desktop app → Extensions → Manage** (or **Settings → Extensions** in the older layout), with custom installation under **Advanced settings → Extension Developer → Install Extension**. Exter has not yet shipped a `.mcpb` extension, so that install flow is not a ready-made Exter package. See [Claude's current local MCP instructions](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop).

## Verify the server

From the repository root, start the stdio process with `npm run mcp` (or `node --import tsx scripts/claude-mcp.ts`). It waits for MCP JSON-RPC messages on stdin; it is not an HTTP page or interactive terminal chat. Protocol messages use stdout; diagnostics and Node warnings use stderr. A missing database produces an actionable error and **does not create or seed a new database**.

Automated tests in `tests/mcp.test.ts` use the official SDK client for a real stdio handshake and in-memory MCP calls. They verify per-platform format results, source IDs, validated scope, bounded records, read-only annotations, missing-analysis handling and that stdio queries preserve stored records.

## Claude web and team-wide access

This implementation supplies a local stdio server for Claude Desktop. **It does not publish a remote connector or connect a Claude team automatically.** Claude web/team deployment needs an approved HTTPS MCP endpoint, client-compatible authentication (typically OAuth), user/workspace access controls, an accessible data store, and administrator configuration. A public, unauthenticated endpoint over this single-workspace app is not an acceptable shortcut.

Once that authenticated endpoint is deployed, add its URL through Claude's **Settings → Connectors** custom-connector flow. For an organisation, an owner first adds it in **Organization settings → Connectors → Add → Custom → Web**, then configures access and sign-in. There is currently no deployed Exter connector URL to paste into that field. See [Claude's remote MCP setup](https://support.claude.com/en/articles/11175166-getting-started-with-custom-connectors-using-remote-mcp).

No authorised provider accounts or Claude client were connected during development. SDK tests establish that the tools and transport work; they do not establish your Claude workspace connection or live provider access. Public competitor engagement cannot establish competitor conversions, and a saved observation is not a real-time performance feed.
