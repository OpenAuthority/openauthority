import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CoverageMap } from "./CoverageMap";

// ─── fetch mock ───────────────────────────────────────────────────────────────

type MockFetchResponse = { ok: boolean; json: () => Promise<unknown>; status?: number };
const fetchMock = vi.fn<() => Promise<MockFetchResponse>>();
vi.stubGlobal("fetch", fetchMock);

// ─── URL / Blob / anchor mocks ────────────────────────────────────────────────

const revokeObjectURLMock = vi.fn();
const createObjectURLMock = vi.fn(() => "blob:mock");
vi.stubGlobal("URL", { createObjectURL: createObjectURLMock, revokeObjectURL: revokeObjectURLMock });

type Rule = {
  id: string;
  effect: "permit" | "forbid";
  resource: "tool" | "command" | "channel" | "prompt";
  match: string;
  condition?: string;
  reason?: string;
  tags?: string[];
  rateLimit?: { maxCalls: number; windowSeconds: number };
};

const toolRules: Rule[] = [
  { id: "r1", effect: "permit", resource: "tool", match: "bash", reason: "Allow bash" },
  { id: "r2", effect: "forbid", resource: "tool", match: "rm", reason: "Prevent rm" },
  { id: "r3", effect: "permit", resource: "tool", match: "grep", rateLimit: { maxCalls: 5, windowSeconds: 60 } },
];

const agentRules: Rule[] = [
  {
    id: "r4",
    effect: "permit",
    resource: "tool",
    match: "bash",
    condition: "return context.agentId === 'agent-alpha'",
  },
  {
    id: "r5",
    effect: "forbid",
    resource: "tool",
    match: "rm",
    condition: "return context.agentId === 'agent-beta'",
  },
];

function mockFetch(rules: Rule[]) {
  fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve(rules) });
}

function mockFetchError(status = 500) {
  fetchMock.mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.reject(new Error()),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CoverageMap", () => {
  describe("loading state", () => {
    it("shows loading indicator while fetching", () => {
      fetchMock.mockReturnValue(new Promise(() => {}));
      render(<CoverageMap />);
      expect(screen.getByText("Loading coverage data…")).toBeInTheDocument();
    });
  });

  describe("error state", () => {
    it("shows error when fetch fails", async () => {
      mockFetchError();
      render(<CoverageMap />);
      await waitFor(() => {
        expect(screen.getByText(/Error: HTTP 500/)).toBeInTheDocument();
      });
    });
  });

  describe("empty state", () => {
    it("shows empty state when no tool rules exist", async () => {
      mockFetch([{ id: "r1", effect: "permit", resource: "command", match: "ls" }]);
      render(<CoverageMap />);
      await waitFor(() => {
        expect(screen.getByText("No tool rules found.")).toBeInTheDocument();
      });
    });
  });

  describe("coverage grid", () => {
    it("renders coverage matrix with agents and tools", async () => {
      mockFetch(toolRules);
      render(<CoverageMap />);
      await waitFor(() => {
        expect(screen.getByRole("table", { name: "Coverage map" })).toBeInTheDocument();
      });
    });

    it("shows tool names as column headers", async () => {
      mockFetch(toolRules);
      render(<CoverageMap />);
      await waitFor(() => {
        expect(screen.getByText("bash")).toBeInTheDocument();
        expect(screen.getByText("rm")).toBeInTheDocument();
        expect(screen.getByText("grep")).toBeInTheDocument();
      });
    });

    it("uses fallback agents when rules have no agent conditions", async () => {
      mockFetch(toolRules);
      render(<CoverageMap />);
      await waitFor(() => {
        expect(screen.getByText("agent-001")).toBeInTheDocument();
        expect(screen.getByText("agent-dev")).toBeInTheDocument();
      });
    });

    it("extracts agents from rule conditions", async () => {
      mockFetch(agentRules);
      render(<CoverageMap />);
      await waitFor(() => {
        expect(screen.getByText("agent-alpha")).toBeInTheDocument();
        expect(screen.getByText("agent-beta")).toBeInTheDocument();
      });
    });

    it("renders permit cell with ✓ icon", async () => {
      mockFetch(toolRules);
      render(<CoverageMap />);
      await waitFor(() => {
        const permitCells = document.querySelectorAll(".coverage-cell--permit");
        expect(permitCells.length).toBeGreaterThan(0);
      });
    });

    it("renders forbid cell with ✕ icon", async () => {
      mockFetch(toolRules);
      render(<CoverageMap />);
      await waitFor(() => {
        const forbidCells = document.querySelectorAll(".coverage-cell--forbid");
        expect(forbidCells.length).toBeGreaterThan(0);
      });
    });

    it("shows ⏱ badge on cells with rate-limited rules", async () => {
      mockFetch(toolRules);
      render(<CoverageMap />);
      await waitFor(() => {
        const rlBadges = document.querySelectorAll(".coverage-cell-rl-badge");
        expect(rlBadges.length).toBeGreaterThan(0);
      });
    });

    it("shows correct aria-label for cell", async () => {
      mockFetch(toolRules);
      render(<CoverageMap />);
      await waitFor(() => {
        // bash is permit
        const cell = screen.getByRole("cell", { name: /agent-001 \/ bash: Permitted/i });
        expect(cell).toBeInTheDocument();
      });
    });
  });

  describe("summary stats", () => {
    it("displays permit and forbid counts", async () => {
      mockFetch(toolRules);
      render(<CoverageMap />);
      await waitFor(() => {
        expect(screen.getByText(/permitted/)).toBeInTheDocument();
        expect(screen.getByText(/forbidden/)).toBeInTheDocument();
        expect(screen.getByText(/no rule/)).toBeInTheDocument();
      });
    });

    it("shows agent × tool count in summary", async () => {
      mockFetch(toolRules);
      render(<CoverageMap />);
      await waitFor(() => {
        // fallback has 4 agents, toolRules has 3 tools
        expect(screen.getByText(/4 agents × 3 tools/)).toBeInTheDocument();
      });
    });
  });

  describe("filtering", () => {
    it("filters agents by name", async () => {
      mockFetch(toolRules);
      const user = userEvent.setup();
      render(<CoverageMap />);
      await waitFor(() => screen.getByText("agent-001"));

      await user.type(screen.getByRole("textbox", { name: /filter agents/i }), "dev");

      await waitFor(() => {
        expect(screen.getByText("agent-dev")).toBeInTheDocument();
        expect(screen.queryByText("agent-001")).not.toBeInTheDocument();
      });
    });

    it("filters tools by name", async () => {
      mockFetch(toolRules);
      const user = userEvent.setup();
      render(<CoverageMap />);
      await waitFor(() => screen.getByText("bash"));

      await user.type(screen.getByRole("textbox", { name: /filter tools/i }), "bash");

      await waitFor(() => {
        expect(screen.getByText("bash")).toBeInTheDocument();
        expect(screen.queryByText("rm")).not.toBeInTheDocument();
      });
    });

    it("shows empty grid message when all agents are filtered out", async () => {
      mockFetch(toolRules);
      const user = userEvent.setup();
      render(<CoverageMap />);
      await waitFor(() => screen.getByText("agent-001"));

      await user.type(screen.getByRole("textbox", { name: /filter agents/i }), "agent-zzz");

      await waitFor(() => {
        expect(screen.getByText("No results match the current filters.")).toBeInTheDocument();
      });
    });

    it("switches resource filter to command", async () => {
      mockFetch([
        ...toolRules,
        { id: "r10", effect: "permit", resource: "command", match: "ls" },
      ]);
      const user = userEvent.setup();
      render(<CoverageMap />);
      await waitFor(() => screen.getByText("bash"));

      await user.selectOptions(screen.getByRole("combobox", { name: /resource type/i }), "command");

      await waitFor(() => {
        expect(screen.getByText("ls")).toBeInTheDocument();
        expect(screen.queryByText("bash")).not.toBeInTheDocument();
      });
    });
  });

  describe("legend", () => {
    it("shows all legend items", async () => {
      mockFetch(toolRules);
      render(<CoverageMap />);
      await waitFor(() => {
        expect(screen.getByText("Permit")).toBeInTheDocument();
        expect(screen.getByText("Forbid")).toBeInTheDocument();
        expect(screen.getByText("No rule (implicit deny)")).toBeInTheDocument();
        expect(screen.getByText("Rate limited")).toBeInTheDocument();
      });
    });
  });

  describe("CSV export", () => {
    it("triggers download when Export CSV is clicked", async () => {
      mockFetch(toolRules);
      const user = userEvent.setup();

      // Spy on document.createElement to intercept anchor click
      const clickSpy = vi.fn();
      const originalCreate = document.createElement.bind(document);
      vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
        const el = originalCreate(tag);
        if (tag === "a") {
          vi.spyOn(el as HTMLAnchorElement, "click").mockImplementation(clickSpy);
        }
        return el;
      });

      render(<CoverageMap />);
      await waitFor(() => screen.getByText("bash"));

      await user.click(screen.getByRole("button", { name: /export coverage report as csv/i }));

      expect(createObjectURLMock).toHaveBeenCalled();
      expect(clickSpy).toHaveBeenCalled();
      expect(revokeObjectURLMock).toHaveBeenCalled();

      vi.restoreAllMocks();
    });
  });
});
