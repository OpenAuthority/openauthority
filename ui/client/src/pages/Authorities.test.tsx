import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Authorities } from "./Authorities";
import type { Rule } from "../api";

// Mock child views to isolate Authorities page logic
vi.mock("../views/RulesTable", () => ({
  RulesTable: ({ onEdit, refreshKey }: { onEdit?: (r: Rule) => void; refreshKey?: number }) => (
    <div data-testid="rules-table" data-refresh-key={refreshKey}>
      <button onClick={() => onEdit?.({ id: "r1", effect: "permit", resource: "tool", match: "bash" })}>
        Edit bash
      </button>
    </div>
  ),
}));

vi.mock("../views/RuleEditor", () => ({
  RuleEditor: ({
    ruleId,
    onSave,
    onCancel,
  }: {
    ruleId?: string;
    onSave: (r: Rule) => void;
    onCancel: () => void;
  }) => (
    <div data-testid="rule-editor" data-rule-id={ruleId ?? ""}>
      <button onClick={() => onSave({ id: ruleId ?? "new", effect: "permit", resource: "tool", match: "bash" })}>
        Save
      </button>
      <button onClick={onCancel}>Cancel</button>
    </div>
  ),
}));

describe("Authorities page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the page heading", () => {
    render(<Authorities />);
    expect(screen.getByRole("heading", { name: "Authorities" })).toBeInTheDocument();
  });

  it("renders RulesTable by default", () => {
    render(<Authorities />);
    expect(screen.getByTestId("rules-table")).toBeInTheDocument();
    expect(screen.queryByTestId("rule-editor")).not.toBeInTheDocument();
  });

  it("shows '+ New Rule' button when table is visible", () => {
    render(<Authorities />);
    expect(screen.getByRole("button", { name: "+ New Rule" })).toBeInTheDocument();
  });

  it("opens RuleEditor when '+ New Rule' is clicked", async () => {
    const user = userEvent.setup();
    render(<Authorities />);
    await user.click(screen.getByRole("button", { name: "+ New Rule" }));
    expect(screen.getByTestId("rule-editor")).toBeInTheDocument();
    expect(screen.queryByTestId("rules-table")).not.toBeInTheDocument();
  });

  it("hides '+ New Rule' button when editor is open", async () => {
    const user = userEvent.setup();
    render(<Authorities />);
    await user.click(screen.getByRole("button", { name: "+ New Rule" }));
    expect(screen.queryByRole("button", { name: "+ New Rule" })).not.toBeInTheDocument();
  });

  it("opens editor with ruleId when Edit is clicked in table", async () => {
    const user = userEvent.setup();
    render(<Authorities />);
    await user.click(screen.getByRole("button", { name: "Edit bash" }));
    const editor = screen.getByTestId("rule-editor");
    expect(editor).toBeInTheDocument();
    expect(editor).toHaveAttribute("data-rule-id", "r1");
  });

  it("closes editor and shows table when Cancel is clicked", async () => {
    const user = userEvent.setup();
    render(<Authorities />);
    await user.click(screen.getByRole("button", { name: "+ New Rule" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByTestId("rules-table")).toBeInTheDocument();
    expect(screen.queryByTestId("rule-editor")).not.toBeInTheDocument();
  });

  it("closes editor and increments refreshKey when Save is clicked", async () => {
    const user = userEvent.setup();
    render(<Authorities />);

    // Initial refresh key should be 0
    expect(screen.getByTestId("rules-table")).toHaveAttribute("data-refresh-key", "0");

    await user.click(screen.getByRole("button", { name: "+ New Rule" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(screen.getByTestId("rules-table")).toBeInTheDocument();
    });
    expect(screen.getByTestId("rules-table")).toHaveAttribute("data-refresh-key", "1");
  });

  it("increments refreshKey on each save", async () => {
    const user = userEvent.setup();
    render(<Authorities />);

    for (let i = 1; i <= 3; i++) {
      await user.click(screen.getByRole("button", { name: "+ New Rule" }));
      await user.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => screen.getByTestId("rules-table"));
      expect(screen.getByTestId("rules-table")).toHaveAttribute("data-refresh-key", String(i));
    }
  });
});
