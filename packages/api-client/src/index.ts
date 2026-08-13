import createOpenApiClient, { type Client } from "openapi-fetch";

import type { paths } from "./schema.gen.js";

export type ApiPaths = paths;
export type ApiClient = Client<paths>;

export interface CreateApiClientOptions {
  /**
   * Base URL of the API. In the browser this is normally left undefined so
   * requests go to the same origin, which is how CloudFront routes /api/*.
   */
  baseUrl?: string;
  /** Bearer token from Cognito, when calling an authenticated route. */
  token?: string;
  fetch?: typeof globalThis.fetch;
}

export function createApiClient(
  options: CreateApiClientOptions = {},
): ApiClient {
  const { baseUrl = "", token, fetch } = options;

  return createOpenApiClient<paths>({
    baseUrl,
    fetch,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}
