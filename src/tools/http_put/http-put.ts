/**
 * http_put tool implementation.
 *
 * Sends an HTTP PUT request to a URL with an optional request body.
 * Policy enforcement (HITL gating and Cedar stage2 URL policy) is handled
 * at the pipeline layer; this module performs only the network operation.
 *
 * Action class: web.post
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** Input parameters for the http_put tool. */
export interface HttpPutParams {
  /** URL to send the PUT request to. */
  url: string;
  /** Request body to send. Serialise JSON before passing. */
  body?: string;
  /** Optional HTTP request headers as key-value pairs. */
  headers?: Record<string, string>;
}

/** Successful result from the http_put tool. */
export interface HttpPutResult {
  /** HTTP response status code. */
  status_code: number;
  /** Response body as a UTF-8 string. */
  body: string;
}

// ─── Error ────────────────────────────────────────────────────────────────────

/**
 * Typed error thrown by `httpPut`.
 *
 * - `invalid-url`    — the provided URL is not a valid http/https URL.
 * - `network-error`  — a network-level failure occurred during the request.
 */
export class HttpPutError extends Error {
  constructor(
    message: string,
    public readonly code: 'invalid-url' | 'network-error',
  ) {
    super(message);
    this.name = 'HttpPutError';
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Sends an HTTP PUT request to the given URL.
 *
 * @param params  URL, optional body, and optional headers.
 * @returns       `{ status_code, body }` — the HTTP response.
 *
 * @throws {HttpPutError} code `invalid-url`   — URL is not http/https.
 * @throws {HttpPutError} code `network-error` — network failure.
 */
export async function httpPut(params: HttpPutParams): Promise<HttpPutResult> {
  const { url, body, headers } = params;

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    throw new HttpPutError(
      `http_put: invalid URL '${url}' — only http and https schemes are supported.`,
      'invalid-url',
    );
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'PUT',
      body: body ?? undefined,
      headers: headers ?? {},
    });
  } catch (err: unknown) {
    const cause = err instanceof Error ? err.message : String(err);
    throw new HttpPutError(
      `http_put: network error while requesting '${url}': ${cause}`,
      'network-error',
    );
  }

  const responseBody = await response.text();
  return {
    status_code: response.status,
    body: responseBody,
  };
}
