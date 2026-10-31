import type { RequestHandler } from "express";

/** Basic-auth browsers attach credentials automatically; paid actions require JSON
 * and reject requests originating on another site. CLI clients may omit Origin. */
export const protectSettingsMutation: RequestHandler = (req, res, next) => {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();
  const origin = req.get("origin");
  let foreignOrigin = false;
  if (origin) {
    try {
      const parsed = new URL(origin);
      foreignOrigin = !["http:", "https:"].includes(parsed.protocol) || parsed.host !== req.get("host");
    } catch { foreignOrigin = true; }
  }
  if (foreignOrigin || req.get("sec-fetch-site") === "cross-site") {
    res.status(403).json({ error: "Open this action from the authenticated Exter app." });
    return;
  }
  if (!req.is("application/json")) {
    res.status(415).json({ error: "Send this action as application/json." });
    return;
  }
  next();
};
