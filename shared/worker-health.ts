export const WORKER_JOB_TYPES = ["onboarding", "collection", "owned", "media", "creators", "categories", "kernel"] as const;
export type WorkerJobType = typeof WORKER_JOB_TYPES[number];
export const WORKER_JOB_NAMES: Record<WorkerJobType, string> = {onboarding:"Brand setup",collection:"Ad collection",owned:"Account sync",media:"Ad media",creators:"Creator search",categories:"Ad tagging",kernel:"Media processing"};
export interface WorkerDiagnostic {name:string; message:string; code:string|null; location:string|null; httpStatus:number|null}
export interface WorkerFailure {type:WorkerJobType; jobId:string; workspaceId:string|null; failures:number; status:"retrying"|"paused"|"resolved"; lastFailedAt:string; nextAttemptAt:string|null; error:WorkerDiagnostic}
export interface WorkerHealth {failures:WorkerFailure[]; checkedAt:string}
