import { spawn } from "node:child_process";
import type pg from "pg";
import type { DiscoveryProfile } from "../../shared/creator-discovery.js";
import { fetchWebsiteResource, type DemoWebsiteOptions } from "../demo/website.js";
import { validateLogo } from "../brand-logos.js";
import { creatorImageUrl } from "./discovery-provider.js";
function smallPreview(bytes: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-protocol_whitelist", "file,pipe", "-i", "pipe:0", "-vf", "scale=160:160:force_original_aspect_ratio=decrease", "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "pipe:1"], { stdio: ["pipe", "pipe", "ignore"] });
    const chunks: Buffer[] = []; let size = 0;
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Preview timeout.")); }, 10000);
    child.on("error", () => { clearTimeout(timer); reject(new Error("Preview unavailable.")); });
    child.stdout.on("data", (b: Buffer) => { size += b.length; if (size > 200000) { child.kill("SIGKILL"); } else chunks.push(b); });
    child.on("close", code => { clearTimeout(timer); if (code !== 0 || size > 200000 || !size) reject(new Error("Preview unavailable.")); else resolve(Buffer.concat(chunks)); });
    child.stdin.on("error", () => {}); child.stdin.end(bytes);
  });
}
export async function retainCreatorPreviews(pool: pg.Pool, workspace: string, profile: DiscoveryProfile, options: DemoWebsiteOptions & { convert?: (bytes: Buffer) => Promise<Buffer> } = {}): Promise<DiscoveryProfile> {
  const posts = [];
  for (const [index, post] of profile.posts.entries()) {
    let thumbnail: string | null = null;
    if (index < 3) {
      const cached = await pool.query("SELECT 1 FROM creator_discovery_previews WHERE workspace_id=$1 AND handle=$2 AND post_id=$3", [workspace, profile.handle, post.id]);
      if (cached.rowCount) thumbnail = `/api/creator-discovery/preview?${new URLSearchParams({ workspaceId: workspace, handle: profile.handle, postId: post.id })}`;
      else if (creatorImageUrl(post.thumbnail)) {
        try {
          const url = new URL(post.thumbnail!), image = await fetchWebsiteResource(url.hostname, url.href, 200001, options);
          validateLogo(image.bytes, image.type); const bytes = await (options.convert ?? smallPreview)(image.bytes);
          if (bytes.length > 200000) throw new Error();
          const added = await pool.query(`INSERT INTO creator_discovery_previews(workspace_id,handle,post_id,image) SELECT $1,$2,$3,$4
            WHERE EXISTS(SELECT 1 FROM creator_discovery_results WHERE workspace_id=$1 AND handle=$2)
            ON CONFLICT(workspace_id,handle,post_id) DO NOTHING RETURNING post_id`, [workspace, profile.handle, post.id, bytes]);
          if (added.rowCount) thumbnail = `/api/creator-discovery/preview?${new URLSearchParams({ workspaceId: workspace, handle: profile.handle, postId: post.id })}`;
        } catch { /* A failed bounded preview never becomes a guessed image. */ }
      }
    }
    posts.push({ ...post, thumbnail });
  }
  return { ...profile, posts };
}
