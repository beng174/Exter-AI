import type { Express } from "express";
import { metaStatus } from "../connectors/meta-library.js";
import { tiktokCommercialStatus } from "../connectors/tiktok-commercial.js";
import { EXTRACTED_PIPELINE_VERSION, REFERENCE_PIPELINE_VERSION, LABEL_MODEL } from "../../shared/analysis-kernel.js";
export function attachKernelStatus(app: Express) {
    app.get("/api/kernel/status", (_req, res) => { res.setHeader("Cache-Control", "private, no-store"); res.json({ priority: "backend-kernel", reference: { pipeline: REFERENCE_PIPELINE_VERSION, implementationAvailable: true, status: process.env.GEMINI_API_KEY?.trim() ? "configured" : "not_configured" }, candidate: { pipeline: EXTRACTED_PIPELINE_VERSION, status: "not_ready", enabled: false, model: LABEL_MODEL, thinking: "minimal", thinkingOffGuaranteed: false, blockers: ["Shared worker artifact transport is not configured.", "Local extraction stages and model weights have not passed worker capacity/quality gates.", "The paired labelled-set benchmark and escalation calibration are pending."] }, sources: { meta: metaStatus(), tiktok: tiktokCommercialStatus() }, workStartsOnRead: false }); });
}
