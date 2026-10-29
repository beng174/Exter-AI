import type { Express } from "express";
import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { readBrand } from "./db.js";
import type { Ad } from "../shared/types.js";
import type { AdAnalysis } from "../shared/ad-intelligence.js";

// Pinned public model revisions. No Claude client or external model API key is used.
export const BRAIN_MODELS = {
  text: {
    name: "Xenova/all-MiniLM-L6-v2",
    revision: "751bff37182d3f1213fa05d7196b954e230abad9",
  },
  vision: {
    name: "Xenova/clip-vit-base-patch32",
    revision: "6b7c523703ae26e39be4b03774966f8571c7f523",
  },
};
const concepts = [
  "A skincare or beauty routine",
  "An outfit or fashion styling idea",
  "A wellness or fitness routine",
  "Food or drink discovery",
  "An automobile or technology product",
  "A customer review or testimonial",
  "A product demonstration or tutorial",
  "A new product launch or brand announcement",
  "A price discount or limited offer",
  "An educational product explanation",
  "An entertaining lifestyle story",
];
const styles=[{name:'Reviews & testimonials',text:'A customer shares a first-person review, honest opinion or testimonial about using a product.'},{name:'Product demo',text:'A step-by-step product demonstration or how-to tutorial shows how a product works.'},{name:'Brand announcement',text:'A brand announces a new product, launch or company news.'},{name:'Educational explainer',text:'An educational explanation of a product, its ingredients or features.'},{name:'Promotional offer',text:'A sales promotion offers a discount, price reduction or limited-time deal.'}];
const visualConcepts = [
  "a photograph of skincare or cosmetic products",
  "a fashion outfit or clothing product",
  "a person demonstrating a product",
  "a static promotional graphic containing text",
  "a written customer review or testimonial",
  "a side-by-side before and after comparison",
  "a person speaking to a camera",
  "a food or drink product photograph",
  "a health or fitness activity",
  "a car or technology product",
];
let textPipeline: Promise<any> | null = null,
  visionPipeline: Promise<any> | null = null;
async function localPipeline(kind: "text" | "vision") {
  const { pipeline, env } = await import("@huggingface/transformers");
  env.cacheDir = resolve(".data/models");
  const model = BRAIN_MODELS[kind];
  // Model artifacts are fetched over verified HTTPS at immutable revisions, with no remote code execution.
  return pipeline(
    kind === "text" ? "feature-extraction" : "zero-shot-image-classification",
    model.name,
    { revision: model.revision, dtype: "q8", device: "cpu" } as any,
  );
}
function similarity(a: number[], b: number[]) {
  return a.reduce((total, value, i) => total + value * b[i], 0);
}
function safeImage(ad: Ad): string | null {
  if (/^\/images\/[a-zA-Z0-9_-]+\.(jpg|png|webp)$/.test(ad.image))
    return resolve("public", ad.image.slice(1));
  try {
    const url = new URL(ad.image);
    if (
      url.protocol === "https:" &&
      ["i.ytimg.com", "img.youtube.com"].includes(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.port
    )
      return url.href;
  } catch {}
  return null;
}
export async function analyseLocally(
  ad: Ad,
): Promise<{ analysis: AdAnalysis; creativeFormats: string[] }> {
  const source = [ad.title, ad.copy].filter(Boolean).join(". ").slice(0, 4000);
  if (!source.trim())
    throw new Error("No source text or usable media is available to analyse.");
  textPipeline ??= localPipeline("text");
  const extractor = await textPipeline;
  const vectors = (
    await extractor([source, ...concepts,...styles.map(style=>style.text)], { pooling: "mean", normalize: true })
  ).tolist() as number[][];
  const scores = concepts
    .map((label, index) => ({
      label,
      score: similarity(vectors[0], vectors[index + 1]),
    }))
    .sort((a, b) => b.score - a.score);
  const top = scores[0];
  const styleScores=styles.map((style,index)=>({...style,score:similarity(vectors[0],vectors[concepts.length+index+1])})).sort((a,b)=>b.score-a.score);
  const style=styleScores[0];const styleSupported=style.score>=.42&&style.score-(styleScores[1]?.score||0)>=.025;
  const analysis: AdAnalysis = {
    provenance: "model",
    model: `${BRAIN_MODELS.text.name}@${BRAIN_MODELS.text.revision}`,
    method:
      "Local semantic embeddings; extractive source message; optional still-image concept inference",
    analyzedAt: new Date().toISOString(),
    topic: top.score >= 0.3 ? top.label : undefined,
    theme: top.score >= 0.3 ? top.label : undefined,
    contentType: styleSupported?style.name:undefined,
    contentOrientation: top.label.includes("educational")
      ? "Product education"
      : top.label.includes("offer")
        ? "Promotional offer"
        : undefined,
    brandMentions: [ad.brand].filter((name) =>
      source.toLowerCase().includes(name.toLowerCase()),
    ),
    keyMessage: (ad.copy || ad.title).slice(0, 500),
    observedRelevance: `Local semantic model similarity to its leading concept: ${top.score.toFixed(3)}. This is an uncalibrated similarity score, not a probability or verified audience measurement. Key message is an extract from source text. Coverage: supplied text and a still image/thumbnail where available; full video frames and audio are not processed.`,
    inferredAudience:
      top.score >= 0.42
        ? [
            `People interested in ${top.label.toLowerCase().replace(/^an? /, "")}`,
          ]
        : undefined,
  };
  const creativeFormats = [...(ad.creativeFormats || [])];
  // Origins such as UGC/influencer cannot be established from a generic image alone.
  if(styleSupported&&['Reviews & testimonials','Product demo'].includes(style.name))creativeFormats.push(style.name);
  analysis.observedRelevance+=` Separate content-style similarity: ${style.name} (${style.score.toFixed(3)}); ${styleSupported?'stored as model inference':'below the confidence heuristic, so no style assigned'}.`;
  const image = safeImage(ad);
  if (image) {
    analysis.model += ` + ${BRAIN_MODELS.vision.name}@${BRAIN_MODELS.vision.revision}`;
    visionPipeline ??= localPipeline("vision");
    const classifier = await visionPipeline;
    const result = (await classifier(image, visualConcepts)) as {
      label: string;
      score: number;
    }[];
    const visual = result[0];
    if (visual) {
      analysis.observedRelevance += ` Local visual concept: ${visual.label} (relative candidate score ${visual.score.toFixed(3)}). Visual interpretations are model inferences, not measured attention.`;
      if (
        visual.score >= 0.6 &&
        visual.score - (result[1]?.score || 0) >= 0.2 &&
        visual.label.includes("before and after")
      )
        creativeFormats.push("Before & after");
    }
  }
  // Personal demographics and heatmaps are deliberately absent: these models do not establish them.
  return { analysis, creativeFormats: [...new Set(creativeFormats)] };
}
interface BrainJob {
  id: string;
  brandId: string;
  status: "queued" | "running" | "complete" | "error";
  processed: number;
  total: number;
  error: string | null;
  createdAt: string;
  finishedAt?: string;
}
const jobs = new Map<string, BrainJob>();
let queue = Promise.resolve();
export function queueAnalysis(
  db: DatabaseSync,
  brandId: string,
  adId?: string,
) {
  const brand = readBrand(db, brandId);
  if (!brand) throw new Error("Workspace not found.");
  const rows = db
    .prepare("SELECT data FROM ads WHERE brand_id=? ORDER BY published_at DESC")
    .all(brandId) as { data: string }[];
  const ads = rows
    .map((row) => JSON.parse(row.data) as Ad)
    .filter(
      (ad) =>
        (brand.mode === "demo"
          ? ad.source === "sample"
          : ad.source !== "sample") &&
        (!adId || ad.id === adId),
    )
    .slice(0, 25);
  if (!ads.length)
    throw new Error("No source records are available to analyse.");
  if (
    [...jobs.values()].some(
      (job) =>
        job.brandId === brandId && ["queued", "running"].includes(job.status),
    )
  )
    throw new Error("An analysis batch is already queued for this workspace.");
  const job: BrainJob = {
    id: randomUUID(),
    brandId,
    status: "queued",
    processed: 0,
    total: ads.length,
    error: null,
    createdAt: new Date().toISOString(),
  };
  jobs.set(job.id, job);
  queue = queue
    .then(async () => {
      job.status = "running";
      try {
        for (const ad of ads) {
          const result = await analyseLocally(ad);
          const current = db
            .prepare("SELECT data FROM ads WHERE id=? AND brand_id=?")
            .get(ad.id, brandId) as { data: string } | undefined;
          if (!current) continue;
          const next = { ...JSON.parse(current.data), ...result };
          db.prepare("UPDATE ads SET data=? WHERE id=? AND brand_id=?").run(
            JSON.stringify(next),
            ad.id,
            brandId,
          );
          job.processed++;
        }
        job.status = "complete";
      } catch {
        textPipeline = null;
        visionPipeline = null;
        job.status = "error";
        job.error =
          "Local inference failed. Model download, source media or runtime may be unavailable. Successfully analysed records were retained; missing fields were not fabricated.";
      }
      job.finishedAt = new Date().toISOString();
    })
    .catch(() => {});
  return job;
}
export function attachBrain(app: Express, db: DatabaseSync) {
  app.get("/api/brain/status", (_req, res) =>
    res.json({
      engine: "exter-local-semantic-vision",
      models: BRAIN_MODELS,
      claudeRequired: false,
      clientAdAccountRequired: false,
      runtime: "local CPU inference",
      textLoaded: Boolean(textPipeline),
      visionLoaded: Boolean(visionPipeline),
      disclosure:
        "Extractive text and local semantic/visual concept inference. No demographic facts, eye-tracking heatmaps, statistical uplift or unobserved conversion metrics are generated.",
    }),
  );
  app.post("/api/brain/analyse", (req, res) => {
    try {
      if (typeof req.body?.brandId !== "string")
        throw new Error("brandId is required.");
      if (req.body.adId !== undefined && typeof req.body.adId !== "string")
        throw new Error("adId must be a source record ID.");
      res.status(202).json(queueAnalysis(db, req.body.brandId, req.body.adId));
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });
  app.get("/api/brain/jobs", (req, res) =>
    res.json(
      [...jobs.values()]
        .filter((job) => job.brandId === req.query.brandId)
        .slice(-5),
    ),
  );
  app.get("/api/brain/jobs/:id", (req, res) => {
    const job = jobs.get(String(req.params.id));
    if (!job) {
      res
        .status(404)
        .json({
          error:
            "Analysis job not found; jobs do not survive a server restart.",
        });
      return;
    }
    res.json(job);
  });
}
