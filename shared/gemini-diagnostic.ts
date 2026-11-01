/** Provider diagnostics are sanitised on the server before persistence or display. */
export interface GeminiDiagnostic {
  stage: string;
  httpStatus?: number;
  providerStatus?: string;
  message: string;
  details?: unknown;
  requestId?: string;
  retryAfterMs?: number;
}
