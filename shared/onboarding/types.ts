export type OnboardingStatus="queued"|"running"|"needs_review"|"paused"|"complete"|"failed"|"uncertain";
export type StepStatus="queued"|"running"|"complete"|"paused"|"needs_review"|"failed"|"uncertain";
export interface WebsitePage {url:string;title:string;text:string;links:string[];socialLinks:string[];prices:{value:number;currency:string}[];checkedAt:string}
export interface BrandUnderstanding {
 categories:string[];keywords:string[];audience:string;ukPresence:"yes"|"no"|"uncertain";ukReasons:string[];
 claims:{text:string;quote:string;source:number}[];
 businessType:"own_brand"|"retailer"|"marketplace"|"reseller"|"unknown";ownRange:boolean;
 matchedCategories:string[];suggestions:{name:string;domain:string}[];
}
export interface DiscoveredPage {
 pageId:string;name:string;website:string|null;username:string|null;ukAds:number;domainAds:number;
 domain:string|null;reach:number|null;examples:{id:string;copy:string;caption:string|null}[];
}
export interface IdentityMatch extends DiscoveredPage {confidence:number;highConfidence:boolean;reasons:string[]}
export interface CompetitorChoice {
 key:string;name:string;domain:string;pageIds:string[];confidence:number;reasons:string[];ukAds:number;reach:number|null;
 categories:string[];keywordOverlap?:number;priceRange:{min:number;max:number;currency:string;products:number}|null;
 state:"automatic"|"needs_review"|"suggested"|"removed"|"confirmed";source:"ads"|"suggestion";
}
export interface OnboardingStepView {key:string;label:string;status:StepStatus;detail:string;count:number|null;estimatedGbp:number|null;reservedGbp:number|null;actualGbp:number|null;costBasis:"estimated"|"observed"|null;checkedAt:string|null}
export interface OnboardingView {
 id:string;workspaceId:string;kind:"initial"|"monthly";status:OnboardingStatus;error:string|null;steps:OnboardingStepView[];
 pages:IdentityMatch[];confirmedPages:IdentityMatch[];manualPages?:string[];competitors:CompetitorChoice[];
 understanding:BrandUnderstanding|null;priceRange:CompetitorChoice["priceRange"];sources:{url:string;title:string}[];
 totals:{ads:number;images:number;tagged:number;mediaPercent:number|null;taggedPercent:number|null};
 needsReview:number;nextReviewAt:string|null;updatedAt:string;
}
