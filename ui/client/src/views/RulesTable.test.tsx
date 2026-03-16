import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RulesTable } from "./RulesTable";
import * as api from "../api";
import type { Rule } from "../api";

vi.mock("../api", () => ({
  rulesApi: {
    list: vi.fn(),
    delete: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    status: number;
    fieldErrors?: { field: string; message: string }[];
    constructor(message: string, status: number, fieldErrors?: { field: string; message: string }[]) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.fieldErrors = fieldErrors;
    }
  },
}));

const mockRules: Rule[] = [
  { id: "r1", effect: "permit", resource: "tool", match: "bash", reason: "Allow bash", tags: ["dev"], rateLimit: { maxCalls: 10, windowSeconds: 60 } },
  { id: "r2", effect: "forbid", resource: "command", match: "rm -rf", reason: "Prevent deletion", tags: ["security"] },
  { id: "r3", effect: "permit", resource: "tool", match: "grep", tags: [] },
  { id: "r4", effect: "permit", resource: "channel", match: "slack", reason: "Allow Slack" },
  { id: "r5", effect: "forbid", resource: "prompt", match: "system-prompt" },
];

function mockList(rules: Rule[] = mockRules) {
  vi.mocked(api.rulesApi.list).mockResolvedValue(rules);
}

describe("RulesTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.confirm = vi.fn(() => true);
    window.alert = vi.fn();
  });

  describe("loading state", () => {
    it("shows loading indicator while fetching", () => {
      vi.mocked(api.rulesApi.list).mockReturnValue(new Promise(() => {}));
      render(<RulesTable />);
      expect(screen.getByText("Loading rules…")).toBeInTheDocument();
    });
  });

  describe("error state", () => {
    it("shows error message on fetch failure", async () => {
      vi.mocked(api.rulesApi.list).mockRejectedValue(new Error("Network error"));
      render(<RulesTable />);
      await waitFor(() => {
        expect(screen.getByText(/Error: Failed to load rules/)).toBeInTheDocument();
      });
    });

    it("shows ApiError message when available", async () => {
      const { ApiError } = await import("../api");
      vi.mocked(api.rulesApi.list).mockRejectedValue(new ApiError("Unauthorized", 401));
      render(<RulesTable />);
      await waitFor(() => {
        expect(screen.getByText(/Error: Unauthorized/)).toBeInTheDocument();
      });
    });
  });

  describe("table rendering", () => {
    it("renders rules in table rows", async () => {
      mockList();
      render(<RulesTable />);
      await waitFor(() => {
        expect(screen.getByText("bash")).toBeInTheDocument();
        expect(screen.getByText("rm -rf")).toBeInTheDocument();
      });
    });

    it("shows effect badges", async () => {
      mockList();
      render(<RulesTable />);
      await waitFor(() => {
        const permitBadges = screen.getAllByText("permit");
        expect(permitBadges.length).toBeGreaterThan(0);
        expect(screen.getAllByText("forbid").length).toBeGreaterThan(0);
      });
    });

    it("shows rate limit with correct format", async () => {
      mockList();
      render(<RulesTable />);
      await waitFor(() => {
        expect(screen.getByText("10 / 60s")).toBeInTheDocument();
      });
    });

    it("shows tags as chips", async () => {
      mockList();
      render(<RulesTable />);
      await waitFor(() => {
        expect(screen.getByText("dev")).toBeInTheDocument();
        expect(screen.getByText("security")).toBeInTheDocument();
      });
    });

    it("renders em-dash for empty cells", async () => {
      mockList([{ id: "r1", effect: "permit", resource: "tool", match: "bash" }]);
      render(<RulesTable />);
      await waitFor(() => {
        // reason, tags and rate-limit columns all show "—"
        const emDashes = screen.getAllByText("—");
        expect(emDashes.length).toBeGreaterThanOrEqual(3);
      });
    });

    it("shows pagination info", async () => {
      mockList();
      render(<RulesTable />);
      await waitFor(() => {
        expect(screen.getByText(/Showing 1–5 of 5 rules/)).toBeInTheDocument();
      });
    });

    it("shows empty state when no rules match filters", async () => {
      mockList([]);
      render(<RulesTable />);
      await waitFor(() => {
        expect(screen.getByText("No rules match the current filters.")).toBeInTheDocument();
      });
    });
  });

  describe("filtering", () => {
    it("filters by effect", async () => {
      mockList();
      const user = userEvent.setup();
      render(<RulesTable />);
      await waitFor(() => screen.getByText("bash"));

      const effectSelect = screen.getByRole("combobox", { name: /filter by effect/i });
      await user.selectOptions(effectSelect, "permit");

      await waitFor(() => {
        expect(screen.getByText("bash")).toBeInTheDocument();
        expect(screen.queryByText("rm -rf")).not.toBeInTheDocument();
      });
    });

    it("filters by resource", async () => {
      mockList();
      const user = userEvent.setup();
      render(<RulesTable />);
      await waitFor(() => screen.getByText("bash"));

      const resourceSelect = screen.getByRole("combobox", { name: /filter by resource/i });
      await user.selectOptions(resourceSelect, "command");

      await waitFor(() => {
        expect(screen.getByText("rm -rf")).toBeInTheDocument();
        expect(screen.queryByText("bash")).not.toBeInTheDocument();
      });
    });

    it("filters by agent/match pattern", async () => {
      mockList();
      const user = userEvent.setup();
      render(<RulesTable />);
      await waitFor(() => screen.getByText("bash"));

      const agentInput = screen.getByRole("textbox", { name: /filter by agent or match pattern/i });
      await user.type(agentInput, "grep");

      await waitFor(() => {
        expect(screen.getByText("grep")).toBeInTheDocument();
        expect(screen.queryByText("bash")).not.toBeInTheDocument();
      });
    });

    it("filters by tag", async () => {
      mockList();
      const user = userEvent.setup();
      render(<RulesTable />);
      await waitFor(() => screen.getByText("bash"));

      const tagInput = screen.getByRole("textbox", { name: /filter by tag/i });
      await user.type(tagInput, "security");

      await waitFor(() => {
        expect(screen.getByText("rm -rf")).toBeInTheDocument();
        expect(screen.queryByText("bash")).not.toBeInTheDocument();
      });
    });

    it("resets to page 1 when filter changes", async () => {
      // Create 15 rules to force pagination
      const manyRules: Rule[] = Array.from({ length: 15 }, (_, i) => ({
        id: `r${i}`,
        effect: "permit",
        resource: "tool",
        match: `tool-${i}`,
      }));
      mockList(manyRules);
      const user = userEvent.setup();
      render(<RulesTable />);
      await waitFor(() => screen.getByText("tool-0"));

      // Go to page 2
      await user.click(screen.getByRole("button", { name: /next page/i }));
      expect(screen.getByText("2 / 2")).toBeInTheDocument();

      // Apply filter — should reset to page 1
      const agentInput = screen.getByRole("textbox", { name: /filter by agent or match pattern/i });
      await user.type(agentInput, "tool");
      await waitFor(() => {
        expect(screen.getByText("1 / 2")).toBeInTheDocument();
      });
    });
  });

  describe("sorting", () => {
    it("sorts by effect ascending by default", async () => {
      mockList();
      render(<RulesTable />);
      await waitFor(() => screen.getByText("bash"));
      // Default sort is effect asc — "forbid" comes before "permit"
      const rows = screen.getAllByRole("row").slice(1); // skip header
      expect(within(rows[0]).getByText("forbid")).toBeInTheDocument();
    });

    it("toggles sort direction on second click", async () => {
      mockList();
      const user = userEvent.setup();
      render(<RulesTable />);
      await waitFor(() => screen.getByText("bash"));

      const effectHeader = screen.getByRole("columnheader", { name: /effect/i });
      // First click: already asc, becomes desc
      await user.click(effectHeader);
      const rows = screen.getAllByRole("row").slice(1);
      expect(within(rows[0]).getByText("permit")).toBeInTheDocument();
    });

    it("sorts by match column", async () => {
      mockList();
      const user = userEvent.setup();
      render(<RulesTable />);
      await waitFor(() => screen.getByText("bash"));

      const matchHeader = screen.getByRole("columnheader", { name: /match/i });
      await user.click(matchHeader);

      await waitFor(() => {
        const rows = screen.getAllByRole("row").slice(1);
        // "bash" is alphabetically first among our rules
        expect(within(rows[0]).getByText("bash")).toBeInTheDocument();
      });
    });

    it("sets aria-sort attribute on sorted column", async () => {
      mockList();
      render(<RulesTable />);
      await waitFor(() => screen.getByText("bash"));
      const effectHeader = screen.getByRole("columnheader", { name: /effect/i });
      expect(effectHeader).toHaveAttribute("aria-sort", "ascending");
    });
  });

  describe("pagination", () => {
    it("shows correct pages for more than PAGE_SIZE rules", async () => {
      const manyRules: Rule[] = Array.from({ length: 12 }, (_, i) => ({
        id: `r${i}`,
        effect: "permit",
        resource: "tool",
        match: `tool-${i}`,
      }));
      mockList(manyRules);
      render(<RulesTable />);
      await waitFor(() => {
        expect(screen.getByText("1 / 2")).toBeInTheDocument();
        expect(screen.getByText(/Showing 1–10 of 12 rules/)).toBeInTheDocument();
      });
    });

    it("navigates to next page", async () => {
      const manyRules: Rule[] = Array.from({ length: 12 }, (_, i) => ({
        id: `r${i}`,
        effect: "permit",
        resource: "tool",
        match: `tool-${String(i).padStart(2, "0")}`,
      }));
      mockList(manyRules);
      const user = userEvent.setup();
      render(<RulesTable />);
      await waitFor(() => screen.getByText("tool-00"));

      await user.click(screen.getByRole("button", { name: /next page/i }));

      await waitFor(() => {
        expect(screen.getByText("2 / 2")).toBeInTheDocument();
        expect(screen.getByText(/Showing 11–12 of 12 rules/)).toBeInTheDocument();
      });
    });

    it("first/last page buttons are disabled at boundaries", async () => {
      mockList();
      render(<RulesTable />);
      await waitFor(() => screen.getByText("bash"));

      expect(screen.getByRole("button", { name: /first page/i })).toBeDisabled();
      expect(screen.getByRole("button", { name: /previous page/i })).toBeDisabled();
      expect(screen.getByRole("button", { name: /next page/i })).toBeDisabled();
      expect(screen.getByRole("button", { name: /last page/i })).toBeDisabled();
    });
  });

  describe("edit action", () => {
    it("calls onEdit with the rule when Edit is clicked", async () => {
      mockList([{ id: "r1", effect: "permit", resource: "tool", match: "bash" }]);
      const onEdit = vi.fn();
      const user = userEvent.setup();
      render(<RulesTable onEdit={onEdit} />);
      await waitFor(() => screen.getByText("bash"));

      await user.click(screen.getByRole("button", { name: /edit rule r1/i }));
      expect(onEdit).toHaveBeenCalledWith(
        expect.objectContaining({ id: "r1", match: "bash" })
      );
    });
  });

  describe("delete action", () => {
    it("calls rulesApi.delete and removes rule on confirm", async () => {
      mockList([
        { id: "r1", effect: "permit", resource: "tool", match: "bash" },
        { id: "r2", effect: "forbid", resource: "command", match: "rm" },
      ]);
      vi.mocked(api.rulesApi.delete).mockResolvedValue(undefined);
      const user = userEvent.setup();
      render(<RulesTable />);
      await waitFor(() => screen.getByText("bash"));

      await user.click(screen.getByRole("button", { name: /delete rule r1/i }));
      expect(window.confirm).toHaveBeenCalled();

      await waitFor(() => {
        expect(api.rulesApi.delete).toHaveBeenCalledWith("r1");
        expect(screen.queryByText("bash")).not.toBeInTheDocument();
      });
    });

    it("does not delete when user cancels confirm", async () => {
      mockList([{ id: "r1", effect: "permit", resource: "tool", match: "bash" }]);
      window.confirm = vi.fn(() => false);
      const user = userEvent.setup();
      render(<RulesTable />);
      await waitFor(() => screen.getByText("bash"));

      await user.click(screen.getByRole("button", { name: /delete rule r1/i }));
      expect(api.rulesApi.delete).not.toHaveBeenCalled();
      expect(screen.getByText("bash")).toBeInTheDocument();
    });

    it("shows alert on delete failure", async () => {
      mockList([{ id: "r1", effect: "permit", resource: "tool", match: "bash" }]);
      vi.mocked(api.rulesApi.delete).mockRejectedValue(new Error("Server error"));
      const user = userEvent.setup();
      render(<RulesTable />);
      await waitFor(() => screen.getByText("bash"));

      await user.click(screen.getByRole("button", { name: /delete rule r1/i }));
      await waitFor(() => {
        expect(window.alert).toHaveBeenCalledWith(expect.stringContaining("Delete failed"));
      });
    });

    it("shows Deleting… while delete is in progress", async () => {
      mockList([{ id: "r1", effect: "permit", resource: "tool", match: "bash" }]);
      let resolveDelete!: () => void;
      vi.mocked(api.rulesApi.delete).mockReturnValue(
        new Promise<void>((res) => { resolveDelete = res; })
      );
      const user = userEvent.setup();
      render(<RulesTable />);
      await waitFor(() => screen.getByText("bash"));

      await user.click(screen.getByRole("button", { name: /delete rule r1/i }));

      await waitFor(() => {
        expect(screen.getByText("Deleting…")).toBeInTheDocument();
      });

      resolveDelete();
    });
  });

  describe("refresh", () => {
    it("re-fetches when refreshKey changes", async () => {
      mockList([{ id: "r1", effect: "permit", resource: "tool", match: "bash" }]);
      const { rerender } = render(<RulesTable refreshKey={0} />);
      await waitFor(() => screen.getByText("bash"));

      mockList([{ id: "r2", effect: "forbid", resource: "command", match: "rm" }]);
      rerender(<RulesTable refreshKey={1} />);

      await waitFor(() => {
        expect(screen.getByText("rm")).toBeInTheDocument();
      });
      expect(api.rulesApi.list).toHaveBeenCalledTimes(2);
    });
  });
});
