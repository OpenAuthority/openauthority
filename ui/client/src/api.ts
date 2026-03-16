// ─── Shared client-side API types ────────────────────────────────────────────

export type Effect = "permit" | "forbid";
export type Resource = "tool" | "command" | "channel" | "prompt";

export interface RateLimit {
  maxCalls: number;
  windowSeconds: number;
}

export interface Rule {
  id: string;
  effect: Effect;
  resource: Resource;
  /** Always a plain string (regex source or literal) */
  match: string;
  /** Serialised function body string */
  condition?: string;
  reason?: string;
  tags?: string[];
  rateLimit?: RateLimit;
}

/** Rule body without the server-generated id, used for POST and PUT bodies. */
export type RuleInput = Omit<Rule, "id">;

export interface FieldError {
  field: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly fieldErrors?: FieldError[]
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ─── Internal request helper ──────────────────────────────────────────────────

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });

  if (!res.ok) {
    const body = await res
      .json()
      .catch(() => ({})) as { error?: string; errors?: FieldError[] };
    throw new ApiError(
      body.error ?? `HTTP ${res.status}`,
      res.status,
      body.errors
    );
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ─── Rules API ────────────────────────────────────────────────────────────────

export const rulesApi = {
  list(filters?: { effect?: string; resource?: string; tags?: string }): Promise<Rule[]> {
    const params = new URLSearchParams();
    if (filters?.effect) params.set("effect", filters.effect);
    if (filters?.resource) params.set("resource", filters.resource);
    if (filters?.tags) params.set("tags", filters.tags);
    const qs = params.toString();
    return request<Rule[]>(`/rules${qs ? `?${qs}` : ""}`);
  },

  create(data: RuleInput): Promise<Rule> {
    return request<Rule>("/rules", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  update(id: string, data: RuleInput): Promise<Rule> {
    return request<Rule>(`/rules/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  delete(id: string): Promise<void> {
    return request<void>(`/rules/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },
};
