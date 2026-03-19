import { useState, useEffect } from "react";
import { rulesApi, ApiError } from "../api";
import type { BuiltinRule } from "../api";
import "./RulesTable.css";

// Client-side mirrored types (do not import from root src/policy/types.ts)
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
  /** Stored as a serialised string, never a RegExp object */
  match: string;
  /** Serialised function body string, not a Function object */
  condition?: string;
  reason?: string;
  tags?: string[];
  rateLimit?: RateLimit;
}

type SortField = "effect" | "resource" | "match" | "reason" | "tags";
type SortDir = "asc" | "desc";

interface Filters {
  effect: string;
  resource: string;
  agent: string;
  tags: string;
}

export interface RulesTableProps {
  onEdit?: (rule: Rule) => void;
  /** Increment to trigger a re-fetch of rules from the server. */
  refreshKey?: number;
}

const PAGE_SIZE = 10;

function sortRules(rules: Rule[], field: SortField, dir: SortDir): Rule[] {
  return [...rules].sort((a, b) => {
    let av: string;
    let bv: string;
    if (field === "tags") {
      av = (a.tags ?? []).join(", ");
      bv = (b.tags ?? []).join(", ");
    } else {
      av = String(a[field] ?? "");
      bv = String(b[field] ?? "");
    }
    const cmp = av.localeCompare(bv);
    return dir === "asc" ? cmp : -cmp;
  });
}

function SortIcon({ field, sortField, sortDir }: { field: SortField; sortField: SortField; sortDir: SortDir }) {
  if (sortField !== field) return <span className="sort-icon" aria-hidden="true">↕</span>;
  return (
    <span className="sort-icon sort-icon--active" aria-hidden="true">
      {sortDir === "asc" ? "↑" : "↓"}
    </span>
  );
}

export function RulesTable({ onEdit, refreshKey }: RulesTableProps) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [builtinRules, setBuiltinRules] = useState<BuiltinRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>("effect");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [filters, setFilters] = useState<Filters>({ effect: "", resource: "", agent: "", tags: "" });
  const [page, setPage] = useState(1);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([rulesApi.list(), rulesApi.listBuiltin()])
      .then(([customData, builtinData]) => {
        setRules(customData as Rule[]);
        setBuiltinRules(builtinData);
        setLoading(false);
      })
      .catch((err: unknown) => {
        const msg = err instanceof ApiError ? err.message : "Failed to load rules";
        setError(msg);
        setLoading(false);
      });
  }, [refreshKey]);

  async function handleDelete(rule: Rule) {
    if (!window.confirm(`Delete rule "${rule.match}"? This cannot be undone.`)) return;
    setDeletingId(rule.id);
    try {
      await rulesApi.delete(rule.id);
      setRules((prev) => prev.filter((r) => r.id !== rule.id));
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Delete failed";
      alert(`Error: ${msg}`);
    } finally {
      setDeletingId(null);
    }
  }

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
    setPage(1);
  }

  function handleFilterChange(key: keyof Filters, value: string) {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  }

  const filtered = rules.filter((rule) => {
    if (filters.effect && rule.effect !== filters.effect) return false;
    if (filters.resource && rule.resource !== filters.resource) return false;
    if (filters.agent && !rule.match.toLowerCase().includes(filters.agent.toLowerCase())) return false;
    if (
      filters.tags &&
      !rule.tags?.some((t) => t.toLowerCase().includes(filters.tags.toLowerCase()))
    )
      return false;
    return true;
  });

  const sorted = sortRules(filtered, sortField, sortDir);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const rangeStart = sorted.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, sorted.length);

  if (loading) return <div className="rules-state rules-state--loading">Loading rules…</div>;
  if (error) return <div className="rules-state rules-state--error">Error: {error}</div>;

  return (
    <div className="rules-table-container">
      {/* Built-in Rules */}
      {builtinRules.length > 0 && (
        <div className="builtin-rules-section">
          <h3 className="builtin-rules-heading">
            Built-in Rules
            <span className="builtin-rules-count">{builtinRules.length}</span>
          </h3>
          <div className="rules-table-wrapper">
            <table className="rules-table">
              <thead>
                <tr>
                  <th className="col-effect">Effect</th>
                  <th className="col-resource">Resource</th>
                  <th className="col-match">Match</th>
                  <th className="col-reason">Reason</th>
                  <th className="col-tags">Tags</th>
                  <th className="col-source">Source</th>
                </tr>
              </thead>
              <tbody>
                {builtinRules.map((rule) => (
                  <tr key={rule.id} className={`rule-row rule-row--${rule.effect}`}>
                    <td>
                      <span className={`effect-badge effect-badge--${rule.effect}`}>
                        {rule.effect}
                      </span>
                    </td>
                    <td>{rule.resource}</td>
                    <td>
                      <code className="match-value">
                        {rule.isRegex ? `/${rule.match}/` : rule.match}
                      </code>
                    </td>
                    <td>{rule.reason ?? <span className="empty-cell">—</span>}</td>
                    <td>
                      {rule.tags && rule.tags.length > 0 ? (
                        <div className="tag-list">
                          {rule.tags.map((tag) => (
                            <span key={tag} className="tag-chip">{tag}</span>
                          ))}
                        </div>
                      ) : (
                        <span className="empty-cell">—</span>
                      )}
                    </td>
                    <td>
                      <span className="source-badge source-badge--builtin">Built-in</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Custom Rules */}
      <h3 className="custom-rules-heading">
        Custom Rules
        <span className="custom-rules-count">{rules.length}</span>
      </h3>

      {/* Filters */}
      <div className="rules-filters">
        <select
          value={filters.effect}
          onChange={(e) => handleFilterChange("effect", e.target.value)}
          className="filter-select"
          aria-label="Filter by effect"
        >
          <option value="">All effects</option>
          <option value="permit">Permit</option>
          <option value="forbid">Forbid</option>
        </select>

        <select
          value={filters.resource}
          onChange={(e) => handleFilterChange("resource", e.target.value)}
          className="filter-select"
          aria-label="Filter by resource"
        >
          <option value="">All resources</option>
          <option value="tool">Tool</option>
          <option value="command">Command</option>
          <option value="channel">Channel</option>
          <option value="prompt">Prompt</option>
        </select>

        <input
          type="text"
          placeholder="Filter by agent / match…"
          value={filters.agent}
          onChange={(e) => handleFilterChange("agent", e.target.value)}
          className="filter-input"
          aria-label="Filter by agent or match pattern"
        />

        <input
          type="text"
          placeholder="Filter by tag…"
          value={filters.tags}
          onChange={(e) => handleFilterChange("tags", e.target.value)}
          className="filter-input"
          aria-label="Filter by tag"
        />
      </div>

      {sorted.length === 0 ? (
        <div className="rules-state rules-state--empty">No rules match the current filters.</div>
      ) : (
        <>
          {/* Table */}
          <div className="rules-table-wrapper">
            <table className="rules-table">
              <thead>
                <tr>
                  <th
                    className="col-effect"
                    onClick={() => handleSort("effect")}
                    aria-sort={sortField === "effect" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                  >
                    Effect <SortIcon field="effect" sortField={sortField} sortDir={sortDir} />
                  </th>
                  <th
                    className="col-resource"
                    onClick={() => handleSort("resource")}
                    aria-sort={sortField === "resource" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                  >
                    Resource <SortIcon field="resource" sortField={sortField} sortDir={sortDir} />
                  </th>
                  <th
                    className="col-match"
                    onClick={() => handleSort("match")}
                    aria-sort={sortField === "match" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                  >
                    Match <SortIcon field="match" sortField={sortField} sortDir={sortDir} />
                  </th>
                  <th
                    className="col-reason"
                    onClick={() => handleSort("reason")}
                    aria-sort={sortField === "reason" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                  >
                    Reason <SortIcon field="reason" sortField={sortField} sortDir={sortDir} />
                  </th>
                  <th
                    className="col-tags"
                    onClick={() => handleSort("tags")}
                    aria-sort={sortField === "tags" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                  >
                    Tags <SortIcon field="tags" sortField={sortField} sortDir={sortDir} />
                  </th>
                  <th className="col-rate-limit">Rate limit</th>
                  <th className="col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((rule) => (
                  <tr key={rule.id} className={`rule-row rule-row--${rule.effect}`}>
                    <td>
                      <span className={`effect-badge effect-badge--${rule.effect}`}>
                        {rule.effect}
                      </span>
                    </td>
                    <td>{rule.resource}</td>
                    <td>
                      <code className="match-value">{rule.match}</code>
                    </td>
                    <td>{rule.reason ?? <span className="empty-cell">—</span>}</td>
                    <td>
                      {rule.tags && rule.tags.length > 0 ? (
                        <div className="tag-list">
                          {rule.tags.map((tag) => (
                            <span key={tag} className="tag-chip">
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="empty-cell">—</span>
                      )}
                    </td>
                    <td>
                      {rule.rateLimit ? (
                        <span className="rate-limit-value">
                          {rule.rateLimit.maxCalls} / {rule.rateLimit.windowSeconds}s
                        </span>
                      ) : (
                        <span className="empty-cell">—</span>
                      )}
                    </td>
                    <td className="col-actions">
                      <div className="action-buttons">
                        <button
                          className="btn-action btn-edit"
                          onClick={() => onEdit?.(rule)}
                          aria-label={`Edit rule ${rule.id}`}
                        >
                          Edit
                        </button>
                        <button
                          className="btn-action btn-delete"
                          onClick={() => handleDelete(rule)}
                          disabled={deletingId === rule.id}
                          aria-label={`Delete rule ${rule.id}`}
                        >
                          {deletingId === rule.id ? "Deleting…" : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="rules-pagination">
            <div className="pagination-info">
              Showing {rangeStart}–{rangeEnd} of {sorted.length} rule{sorted.length !== 1 ? "s" : ""}
            </div>
            <div className="pagination-controls">
              <button
                className="page-btn"
                onClick={() => setPage(1)}
                disabled={currentPage === 1}
                aria-label="First page"
              >
                «
              </button>
              <button
                className="page-btn"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                aria-label="Previous page"
              >
                ‹
              </button>
              <span className="page-indicator">{currentPage} / {totalPages}</span>
              <button
                className="page-btn"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                aria-label="Next page"
              >
                ›
              </button>
              <button
                className="page-btn"
                onClick={() => setPage(totalPages)}
                disabled={currentPage === totalPages}
                aria-label="Last page"
              >
                »
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
