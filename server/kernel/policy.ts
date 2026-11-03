/** Quality-driven escalation contract. Raw model self-confidence is deliberately absent. */
export interface KernelEscalationPolicy {
    version: string;
    calibrationVersion: string | null;
    maxEscalationsPerBatch: number;
    maxEscalationFraction: number;
}
export function decideKernelRoute(input: {
    cacheHit: boolean;
    featuresReady: boolean;
    qualityFlags: string[];
    labelsValid: boolean;
    budgetAllows: boolean;
    batchSize: number;
    escalated: number;
}, policy: KernelEscalationPolicy) {
    if (!policy.version || !Number.isSafeInteger(policy.maxEscalationsPerBatch) || policy.maxEscalationsPerBatch < 0 || !Number.isFinite(policy.maxEscalationFraction) || policy.maxEscalationFraction < 0 || policy.maxEscalationFraction > 1 || !Number.isSafeInteger(input.escalated) || input.escalated < 0)
        return { route: "blocked" as const, reason: "Escalation configuration or attempt count is invalid." };
    if (input.cacheHit)
        return { route: "reuse" as const, reason: "Matching completed result cache." };
    if (!input.budgetAllows)
        return { route: "blocked" as const, reason: "Inference budget does not allow another dispatch." };
    if (input.featuresReady && input.labelsValid && !input.qualityFlags.length)
        return { route: "accept-labels" as const, reason: "Bounded evidence and labels passed quality gates." };
    if (!policy.calibrationVersion)
        return { route: "human-review" as const, reason: "Escalation thresholds have not been calibrated against human labels." };
    if (!Number.isSafeInteger(input.batchSize) || input.batchSize < 1 || input.escalated >= policy.maxEscalationsPerBatch || input.escalated + 1 > input.batchSize * policy.maxEscalationFraction)
        return { route: "human-review" as const, reason: "The configured escalation cap is reached." };
    return { route: "reference-full-video" as const, reason: "Calibrated quality flags require reference analysis; the dispatcher must still reserve the budget before calling." };
}
