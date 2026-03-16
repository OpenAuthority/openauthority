import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RuleEditor } from "./RuleEditor";
import * as api from "../api";
import type { Rule } from "../api";

vi.mock("../api", () => ({
  rulesApi: {
    create: vi.fn(),
    update: vi.fn(),
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

const mockSavedRule: Rule = {
  id: "new-id",
  effect: "permit",
  resource: "tool",
  match: "bash",
};

describe("RuleEditor", () => {
  const onSave = vi.fn();
  const onCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("new rule mode", () => {
    it("shows 'New Rule' title when no ruleId", () => {
      render(<RuleEditor onSave={onSave} onCancel={onCancel} />);
      expect(screen.getByRole("heading", { name: "New Rule" })).toBeInTheDocument();
    });

    it("shows 'Create rule' button in new mode", () => {
      render(<RuleEditor onSave={onSave} onCancel={onCancel} />);
      expect(screen.getByRole("button", { name: "Create rule" })).toBeInTheDocument();
    });

    it("shows live preview heading", () => {
      render(<RuleEditor onSave={onSave} onCancel={onCancel} />);
      expect(screen.getByText("Live preview")).toBeInTheDocument();
    });
  });

  describe("edit rule mode", () => {
    const existingRule: Partial<Rule> = {
      effect: "forbid",
      resource: "command",
      match: "rm -rf",
      reason: "Prevent deletion",
      tags: ["security", "prod"],
      rateLimit: { maxCalls: 5, windowSeconds: 30 },
    };

    it("shows 'Edit Rule' title when ruleId is provided", () => {
      render(<RuleEditor ruleId="r1" initialRule={existingRule} onSave={onSave} onCancel={onCancel} />);
      expect(screen.getByRole("heading", { name: "Edit Rule" })).toBeInTheDocument();
    });

    it("shows 'Save changes' button in edit mode", () => {
      render(<RuleEditor ruleId="r1" initialRule={existingRule} onSave={onSave} onCancel={onCancel} />);
      expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
    });

    it("pre-populates form with initial rule values", () => {
      render(<RuleEditor ruleId="r1" initialRule={existingRule} onSave={onSave} onCancel={onCancel} />);
      expect(screen.getByDisplayValue("rm -rf")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Prevent deletion")).toBeInTheDocument();
      expect(screen.getByDisplayValue("security, prod")).toBeInTheDocument();
    });

    it("shows rate limit fields when existing rule has rate limit", () => {
      render(<RuleEditor ruleId="r1" initialRule={existingRule} onSave={onSave} onCancel={onCancel} />);
      expect(screen.getByLabelText("Max calls")).toBeInTheDocument();
      expect(screen.getByDisplayValue("5")).toBeInTheDocument();
      expect(screen.getByDisplayValue("30")).toBeInTheDocument();
    });
  });

  describe("form interactions", () => {
    it("updates match field on input", async () => {
      const user = userEvent.setup();
      render(<RuleEditor onSave={onSave} onCancel={onCancel} />);
      const matchInput = screen.getByLabelText(/match pattern/i);
      await user.clear(matchInput);
      await user.type(matchInput, "my-tool");
      expect(screen.getByDisplayValue("my-tool")).toBeInTheDocument();
    });

    it("changes effect via select", async () => {
      const user = userEvent.setup();
      render(<RuleEditor onSave={onSave} onCancel={onCancel} />);
      const effectSelect = screen.getByLabelText("Effect");
      await user.selectOptions(effectSelect, "forbid");
      expect(effectSelect).toHaveValue("forbid");
    });

    it("shows rate limit fields when checkbox is checked", async () => {
      const user = userEvent.setup();
      render(<RuleEditor onSave={onSave} onCancel={onCancel} />);
      const rlCheckbox = screen.getByRole("checkbox", { name: /enable rate limiting/i });
      await user.click(rlCheckbox);
      expect(screen.getByLabelText("Max calls")).toBeInTheDocument();
      expect(screen.getByLabelText(/window \(seconds\)/i)).toBeInTheDocument();
    });

    it("hides rate limit fields when checkbox is unchecked", async () => {
      const user = userEvent.setup();
      render(<RuleEditor ruleId="r1" initialRule={{ rateLimit: { maxCalls: 5, windowSeconds: 30 } }} onSave={onSave} onCancel={onCancel} />);
      const rlCheckbox = screen.getByRole("checkbox", { name: /enable rate limiting/i });
      await user.click(rlCheckbox);
      expect(screen.queryByLabelText("Max calls")).not.toBeInTheDocument();
    });

    it("toggles regex mode with checkbox", async () => {
      const user = userEvent.setup();
      render(<RuleEditor onSave={onSave} onCancel={onCancel} />);
      const regexCheckbox = screen.getByRole("checkbox", { name: /regex/i });
      await user.click(regexCheckbox);
      expect(regexCheckbox).toBeChecked();
    });

    it("calls onCancel when Cancel button is clicked", async () => {
      const user = userEvent.setup();
      render(<RuleEditor onSave={onSave} onCancel={onCancel} />);
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(onCancel).toHaveBeenCalledOnce();
    });
  });

  describe("validation", () => {
    it("shows error when match pattern is empty on save", async () => {
      const user = userEvent.setup();
      render(<RuleEditor onSave={onSave} onCancel={onCancel} />);
      await user.click(screen.getByRole("button", { name: "Create rule" }));
      expect(screen.getByText("Match pattern is required.")).toBeInTheDocument();
      expect(api.rulesApi.create).not.toHaveBeenCalled();
    });

    it("shows error for invalid regex when regex mode is on", async () => {
      const user = userEvent.setup();
      render(<RuleEditor onSave={onSave} onCancel={onCancel} />);
      const regexCheckbox = screen.getByRole("checkbox", { name: /regex/i });
      await user.click(regexCheckbox);
      const matchInput = screen.getByLabelText(/match pattern/i);
      // Use fireEvent to avoid userEvent special-character handling for "["
      matchInput.focus();
      await user.paste("[invalid");
      await user.click(screen.getByRole("button", { name: "Create rule" }));
      expect(screen.getByText("Invalid regular expression.")).toBeInTheDocument();
    });

    it("shows error for invalid JavaScript condition", async () => {
      const user = userEvent.setup();
      render(<RuleEditor onSave={onSave} onCancel={onCancel} />);
      const matchInput = screen.getByLabelText(/match pattern/i);
      await user.type(matchInput, "bash");
      const conditionArea = screen.getByLabelText(/condition/i);
      await user.type(conditionArea, "return ===");
      await user.click(screen.getByRole("button", { name: "Create rule" }));
      await waitFor(() => {
        expect(screen.getByText(/Invalid JavaScript/)).toBeInTheDocument();
      });
    });

    it("shows error for non-positive rate limit max calls", async () => {
      const user = userEvent.setup();
      render(<RuleEditor onSave={onSave} onCancel={onCancel} />);
      const matchInput = screen.getByLabelText(/match pattern/i);
      await user.type(matchInput, "bash");
      await user.click(screen.getByRole("checkbox", { name: /enable rate limiting/i }));
      const maxCallsInput = screen.getByLabelText("Max calls");
      await user.clear(maxCallsInput);
      await user.type(maxCallsInput, "0");
      await user.click(screen.getByRole("button", { name: "Create rule" }));
      expect(screen.getByText("Must be a positive integer.")).toBeInTheDocument();
    });

    it("clears field error when user changes the field", async () => {
      const user = userEvent.setup();
      render(<RuleEditor onSave={onSave} onCancel={onCancel} />);
      await user.click(screen.getByRole("button", { name: "Create rule" }));
      expect(screen.getByText("Match pattern is required.")).toBeInTheDocument();

      const matchInput = screen.getByLabelText(/match pattern/i);
      await user.type(matchInput, "x");
      expect(screen.queryByText("Match pattern is required.")).not.toBeInTheDocument();
    });
  });

  describe("create rule", () => {
    it("calls rulesApi.create with correct data", async () => {
      vi.mocked(api.rulesApi.create).mockResolvedValue(mockSavedRule);
      const user = userEvent.setup();
      render(<RuleEditor onSave={onSave} onCancel={onCancel} />);

      const effectSelect = screen.getByLabelText("Effect");
      await user.selectOptions(effectSelect, "permit");
      const matchInput = screen.getByLabelText(/match pattern/i);
      await user.type(matchInput, "bash");
      const reasonInput = screen.getByLabelText(/reason/i);
      await user.type(reasonInput, "Allow bash");

      await user.click(screen.getByRole("button", { name: "Create rule" }));

      await waitFor(() => {
        expect(api.rulesApi.create).toHaveBeenCalledWith(
          expect.objectContaining({ effect: "permit", resource: "tool", match: "bash", reason: "Allow bash" })
        );
        expect(onSave).toHaveBeenCalledWith(mockSavedRule);
      });
    });

    it("shows 'Saving…' while request is in flight", async () => {
      let resolve!: (r: Rule) => void;
      vi.mocked(api.rulesApi.create).mockReturnValue(new Promise((res) => { resolve = res; }));
      const user = userEvent.setup();
      render(<RuleEditor onSave={onSave} onCancel={onCancel} />);

      const matchInput = screen.getByLabelText(/match pattern/i);
      await user.type(matchInput, "bash");
      await user.click(screen.getByRole("button", { name: "Create rule" }));

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Saving…" })).toBeInTheDocument();
      });

      resolve(mockSavedRule);
    });

    it("creates rule with tags parsed from comma-separated string", async () => {
      vi.mocked(api.rulesApi.create).mockResolvedValue(mockSavedRule);
      const user = userEvent.setup();
      render(<RuleEditor onSave={onSave} onCancel={onCancel} />);

      await user.type(screen.getByLabelText(/match pattern/i), "bash");
      await user.type(screen.getByLabelText(/^tags/i), "security, prod");
      await user.click(screen.getByRole("button", { name: "Create rule" }));

      await waitFor(() => {
        expect(api.rulesApi.create).toHaveBeenCalledWith(
          expect.objectContaining({ tags: ["security", "prod"] })
        );
      });
    });

    it("includes rateLimit in payload when enabled", async () => {
      vi.mocked(api.rulesApi.create).mockResolvedValue(mockSavedRule);
      const user = userEvent.setup();
      render(<RuleEditor onSave={onSave} onCancel={onCancel} />);

      await user.type(screen.getByLabelText(/match pattern/i), "bash");
      await user.click(screen.getByRole("checkbox", { name: /enable rate limiting/i }));
      const maxCallsInput = screen.getByLabelText("Max calls");
      await user.clear(maxCallsInput);
      await user.type(maxCallsInput, "5");
      await user.click(screen.getByRole("button", { name: "Create rule" }));

      await waitFor(() => {
        expect(api.rulesApi.create).toHaveBeenCalledWith(
          expect.objectContaining({ rateLimit: expect.objectContaining({ maxCalls: 5 }) })
        );
      });
    });
  });

  describe("update rule", () => {
    it("calls rulesApi.update when ruleId is provided", async () => {
      const updatedRule: Rule = { id: "r1", effect: "forbid", resource: "tool", match: "bash" };
      vi.mocked(api.rulesApi.update).mockResolvedValue(updatedRule);
      const user = userEvent.setup();
      render(<RuleEditor ruleId="r1" initialRule={{ effect: "permit", resource: "tool", match: "bash" }} onSave={onSave} onCancel={onCancel} />);

      const effectSelect = screen.getByLabelText("Effect");
      await user.selectOptions(effectSelect, "forbid");
      await user.click(screen.getByRole("button", { name: "Save changes" }));

      await waitFor(() => {
        expect(api.rulesApi.update).toHaveBeenCalledWith("r1", expect.objectContaining({ effect: "forbid" }));
        expect(onSave).toHaveBeenCalledWith(updatedRule);
      });
    });
  });

  describe("API error handling", () => {
    it("shows API error message on failure", async () => {
      vi.mocked(api.rulesApi.create).mockRejectedValue(new Error("Internal Server Error"));
      const user = userEvent.setup();
      render(<RuleEditor onSave={onSave} onCancel={onCancel} />);
      await user.type(screen.getByLabelText(/match pattern/i), "bash");
      await user.click(screen.getByRole("button", { name: "Create rule" }));
      await waitFor(() => {
        expect(screen.getByText("Internal Server Error")).toBeInTheDocument();
      });
    });

    it("shows field errors from ApiError", async () => {
      const { ApiError } = await import("../api");
      vi.mocked(api.rulesApi.create).mockRejectedValue(
        new ApiError("Validation failed", 422, [{ field: "match", message: "Pattern too long" }])
      );
      const user = userEvent.setup();
      render(<RuleEditor onSave={onSave} onCancel={onCancel} />);
      await user.type(screen.getByLabelText(/match pattern/i), "bash");
      await user.click(screen.getByRole("button", { name: "Create rule" }));
      await waitFor(() => {
        expect(screen.getByText(/match: Pattern too long/)).toBeInTheDocument();
      });
    });
  });

  describe("live preview", () => {
    it("updates preview as user types match pattern", async () => {
      const user = userEvent.setup();
      render(<RuleEditor onSave={onSave} onCancel={onCancel} />);
      const matchInput = screen.getByLabelText(/match pattern/i);
      await user.type(matchInput, "my-tool");
      expect(screen.getByText('"my-tool"')).toBeInTheDocument();
    });

    it("shows regex format in preview when regex mode is on", async () => {
      const user = userEvent.setup();
      render(<RuleEditor onSave={onSave} onCancel={onCancel} />);
      await user.click(screen.getByRole("checkbox", { name: /regex/i }));
      const matchInput = screen.getByLabelText(/match pattern/i);
      await user.type(matchInput, "tool.*");
      expect(screen.getByText("/tool.*/")).toBeInTheDocument();
    });

    it("shows evaluation semantics text", () => {
      render(<RuleEditor onSave={onSave} onCancel={onCancel} />);
      expect(screen.getByText(/Permits access when matched/)).toBeInTheDocument();
    });
  });
});
