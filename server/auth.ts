import { createHash, timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";

export function basicAuth(env: NodeJS.ProcessEnv = process.env): RequestHandler {
  const user = env.EXTER_ADMIN_USER;
  const password = env.EXTER_ADMIN_PASSWORD;
  if (!user || !password) {
    if (env.NODE_ENV === "production" || user || password)
      throw new Error("EXTER_ADMIN_USER and EXTER_ADMIN_PASSWORD are both required; refusing to start.");
    return (_req, _res, next) => next();
  }
  const digest = (value: string) => createHash("sha256").update(value).digest();
  const expected = digest(`${user}:${password}`);
  return (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    const match = /^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(req.headers.authorization || "");
    if (match && timingSafeEqual(digest(Buffer.from(match[1], "base64").toString("utf8")), expected)) {
      next();
      return;
    }
    res.setHeader("WWW-Authenticate", 'Basic realm="Exter", charset="UTF-8"');
    res.status(401).send("Authentication required.");
  };
}
