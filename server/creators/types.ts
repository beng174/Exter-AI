import type { CreatorPlatform, CreatorProviderAccounting, CreatorPublicProfile } from "../../shared/creator-research.js";

export type { CreatorPlatform, CreatorProviderAccounting, CreatorPost as PublicCreatorPost, CreatorPublicProfile as PublicCreatorProfile } from "../../shared/creator-research.js";

export interface CreatorSearchInput {
  platform: CreatorPlatform;
  country: string;
  category: string;
  query?: string;
  maxProfiles?: number;
  maxPostsPerProfile?: number;
  /** Explicit verified platform handles only; Meta partner names are not handles. */
  seedHandles?: string[];
  signal?: AbortSignal;
}
export interface CreatorSearchResult {
  profiles: CreatorPublicProfile[];
  accounting: CreatorProviderAccounting;
  warnings: string[];
}
export interface CreatorProviderStatus {
  configured: boolean;
  platforms: CreatorPlatform[];
  message?: string;
}
export interface CreatorDiscoveryProvider {
  status(): CreatorProviderStatus;
  search(input: CreatorSearchInput): Promise<CreatorSearchResult>;
}
export type CreatorProviderErrorCode = "configuration" | "budget_paused" | "authentication" | "rate_limited" | "unavailable" | "invalid_output" | "cancelled";
export class CreatorProviderError extends Error {
  constructor(public code: CreatorProviderErrorCode, message: string, public accounting?: CreatorProviderAccounting) {
    super(message);
    this.name = "CreatorProviderError";
  }
}
