import type { Express, Response } from "express";
import type { DatabaseSync } from "node:sqlite";
import { protectSettingsMutation } from "../request-guard.js";
import { PatternLabellingError, PatternLabellingService, type PatternLabellingOptions } from "./pattern-labelling.js";
export function attachPatternLabelling(app: Express, db: DatabaseSync, options: PatternLabellingOptions = {}) {
  const service = new PatternLabellingService(db,options);
  app.locals.patternLabelling=service;
  app.use("/api/pattern-labels",protectSettingsMutation);
  const fail=(res:Response,error:unknown)=>res.status(error instanceof PatternLabellingError?error.status:503).json({error:error instanceof PatternLabellingError?error.message:"Saved-analysis labelling is unavailable. Original analyses remain available."});
  app.get("/api/pattern-labels",(req,res)=>{try{res.setHeader("Cache-Control","private, no-store");res.json(service.snapshot(req.query.brandId));}catch(error){fail(res,error);}});
  app.post("/api/pattern-labels/start",async(req,res)=>{try{res.status(202).json(await service.start(req.body?.brandId));}catch(error){fail(res,error);}});
  return service;
}
