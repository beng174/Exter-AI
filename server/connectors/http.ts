import { ConnectorError, type FetchLike } from "./types.js";

// Never follow provider-supplied URLs or redirects to another host with credentials.
export async function providerJson(
  fetcher: FetchLike,
  url: URL,
  init: RequestInit,
  allowedHost: string,
): Promise<Record<string, any>> {
  if (
    url.protocol !== "https:" ||
    url.hostname !== allowedHost ||
    url.username ||
    url.password
  )
    throw new ConnectorError(
      "Provider pagination attempted an unsupported destination.",
    );
  let response: Response;
  try {
    response = await fetcher(url, {
      ...init,
      redirect: "manual",
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw new ConnectorError(
      "The provider could not be reached. Check network access, account permissions and credential readiness; no records were saved.",
    );
  }
  if (response.status >= 300 && response.status < 400)
    throw new ConnectorError(
      "Provider redirected the request; credentials were not forwarded.",
    );
  if (!response.ok) {
    // Raw error payloads may echo tokens and URLs. Never log or expose them.
    const reason =
      response.status === 401 || response.status === 403
        ? "authentication or account permission denied"
        : response.status === 429
          ? "rate limit reached; retry later"
          : `request failed (HTTP ${response.status})`;
    throw new ConnectorError(
      `Provider ${reason}; the previous successful dataset is preserved.`,
      response.status === 429 ? 429 : 502,
    );
  }
  try {
    return await response.json();
  } catch {
    throw new ConnectorError(
      "Provider returned invalid JSON; no records were saved.",
    );
  }
}
export function assertProxySupport(
  injected: boolean,
  env: Record<string, string | undefined>,
) {
  if (
    !injected &&
    (env.HTTPS_PROXY || env.HTTP_PROXY || env.https_proxy || env.http_proxy) &&
    process.env.NODE_USE_ENV_PROXY !== "1" &&
    !process.execArgv.some(
      (arg) => arg === "--use-env-proxy" || arg === "--use-env-proxy=true",
    )
  ) {
    throw new ConnectorError(
      "Start the server with NODE_USE_ENV_PROXY=1 (Node.js 24+) to use the configured secure outbound proxy.",
      409,
    );
  }
}
