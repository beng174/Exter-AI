import { test } from "node:test";
import assert from "node:assert/strict";
import fixture from "../shared/cases/valentte.json";
import type { BrandResearch } from "../shared/brand-research";
import { answerBrandResearchQuestion } from "../shared/brand-research-answer";
const profile = fixture.research as BrandResearch;
test("real Valentte website research never substitutes hypotheses for an ad-format winner", () => {
  const reply = answerBrandResearchQuestion(
    "Which ad format converts best right now?",
    profile,
  )!;
  assert.match(reply.answer, /cannot identify a winning ad format/);
  assert.match(reply.answer, /hypotheses to test/);
  assert.match(reply.answer, /not proof/);
  assert.equal(reply.mode, "rule-based");
  assert.ok(reply.sources.every((source) => source.startsWith("https://")));
});
test("candidate and creator answers retain evidence scope instead of inventing performance or partnerships", () => {
  assert.match(
    answerBrandResearchQuestion("Who are the competitors?", profile)!.answer,
    /analyst-selected/,
  );
  assert.match(
    answerBrandResearchQuestion("Which creators feature?", profile)!.answer,
    /website feature only/,
  );
  assert.match(
    answerBrandResearchQuestion("What is the brand positioning?", profile)!
      .answer,
    /publisher-supplied claims/,
  );
  assert.equal(
    answerBrandResearchQuestion("Predict exchange rates", profile),
    null,
  );
});
test("real test fixture contains actual model provenance and explicitly unmeasured ad results", () => {
  assert.equal(fixture.brand.category, "Home fragrance & gifting");
  assert.equal(fixture.brand.mode, "imported");
  assert.equal(profile.analysisStatus, "complete");
  assert.equal(profile.analysis?.provenance, "model");
  assert.match(profile.analysis!.model!, /MiniLM.*clip/);
  assert.equal(profile.competitorCandidates.length, 3);
  assert.equal(profile.creatorFeatures.length, 4);
  assert.ok(
    profile.proposedTests.every((item) => item.status === "hypothesis"),
  );
  assert.ok(
    profile.coverageChecks?.some(
      (check) =>
        check.label.includes("Meta") && check.status === "Access blocked",
    ),
  );
});
