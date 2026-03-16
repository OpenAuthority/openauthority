import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuditLog } from "./AuditLog";

// ─── EventSource mock ────────────────────────────────────────────────────────

interface MockESInstance {
  onopen: (() => void) | null;
  onerror: (() => void) | null;
  onmessage: ((e: MessageEvent) => void) | null;
  close: () => void;
  url: string;
}

let mockESInstance: MockESInstance | null = null;

class MockEventSource {
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  url: string;

  constructor(url: string) {
    this.url = url;
    mockESInstance = this as unknown as MockESInstance;
  }

  close() {
    // noop
  }
}

vi.stubGlobal("EventSource", MockEventSource);

// ─── navigator.clipboard mock ────────────────────────────────────────────────

const writeTextMock = vi.fn().mockResolvedValue(undefined);

// ─── scrollIntoView mock ─────────────────────────────────────────────────────

beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  writeTextMock.mockClear();
  mockESInstance = null;
  // Re-assign each test because userEvent.setup() may replace navigator.clipboard
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: writeTextMock },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

function fireMessage(data: object) {
  if (!mockESInstance?.onmessage) return;
  mockESInstance.onmessage(new MessageEvent("message", { data: JSON.stringify(data) }));
}

function fireOpen() {
  if (mockESInstance?.onopen) mockESInstance.onopen();
}

function fireError() {
  if (mockESInstance?.onerror) mockESInstance.onerror();
}

const sampleEntry = {
  timestamp: "2024-01-15T10:00:00.000Z",
  policyId: "policy-1",
  policyName: "Default Policy",
  agentId: "agent-001",
  resourceType: "tool",
  action: "bash",
  effect: "permit",
  matchedRuleId: "r1",
  reason: "Allowed by rule",
};

describe("AuditLog", () => {
  describe("initial state", () => {
    it("renders the Audit Log heading", () => {
      render(<AuditLog />);
      expect(screen.getByRole("heading", { name: "Audit Log" })).toBeInTheDocument();
    });

    it("shows Disconnected badge initially", () => {
      render(<AuditLog />);
      expect(screen.getByText("Disconnected")).toBeInTheDocument();
    });

    it("shows waiting message before connection", () => {
      render(<AuditLog />);
      expect(screen.getByText("Connecting to audit log stream…")).toBeInTheDocument();
    });
  });

  describe("SSE connection", () => {
    it("opens EventSource to /api/audit/stream", () => {
      render(<AuditLog />);
      expect(mockESInstance?.url).toBe("/api/audit/stream");
    });

    it("shows Live badge when connection opens", async () => {
      render(<AuditLog />);
      act(() => { fireOpen(); });
      await waitFor(() => {
        expect(screen.getByText("Live")).toBeInTheDocument();
      });
    });

    it("shows Disconnected badge on error", async () => {
      render(<AuditLog />);
      act(() => { fireOpen(); });
      await waitFor(() => screen.getByText("Live"));
      act(() => { fireError(); });
      await waitFor(() => {
        expect(screen.getByText("Disconnected")).toBeInTheDocument();
      });
    });

    it("closes EventSource on unmount", () => {
      const { unmount } = render(<AuditLog />);
      const closeSpy = vi.spyOn(mockESInstance!, "close");
      unmount();
      expect(closeSpy).toHaveBeenCalled();
    });
  });

  describe("receiving entries", () => {
    it("renders an entry when a message is received", async () => {
      render(<AuditLog />);
      act(() => { fireOpen(); fireMessage(sampleEntry); });
      await waitFor(() => {
        expect(screen.getByText("agent-001")).toBeInTheDocument();
        expect(screen.getByText("bash")).toBeInTheDocument();
        expect(screen.getByText("PERMIT")).toBeInTheDocument();
      });
    });

    it("renders effect badge for forbid entry", async () => {
      render(<AuditLog />);
      act(() => { fireOpen(); fireMessage({ ...sampleEntry, effect: "forbid" }); });
      await waitFor(() => {
        expect(screen.getByText("FORBID")).toBeInTheDocument();
      });
    });

    it("renders reason when present", async () => {
      render(<AuditLog />);
      act(() => { fireOpen(); fireMessage(sampleEntry); });
      await waitFor(() => {
        expect(screen.getByText("Allowed by rule")).toBeInTheDocument();
      });
    });

    it("renders multiple entries", async () => {
      render(<AuditLog />);
      act(() => {
        fireOpen();
        fireMessage({ ...sampleEntry, agentId: "agent-001" });
        fireMessage({ ...sampleEntry, agentId: "agent-002" });
      });
      await waitFor(() => {
        expect(screen.getByText("agent-001")).toBeInTheDocument();
        expect(screen.getByText("agent-002")).toBeInTheDocument();
      });
    });

    it("ignores malformed messages", async () => {
      render(<AuditLog />);
      act(() => {
        fireOpen();
        // Send invalid JSON via direct onmessage call
        if (mockESInstance?.onmessage) {
          mockESInstance.onmessage(new MessageEvent("message", { data: "not-json" }));
        }
      });
      // Should still show empty state, not crash
      await waitFor(() => {
        expect(screen.getByText("Waiting for audit events…")).toBeInTheDocument();
      });
    });
  });

  describe("filtering", () => {
    beforeEach(async () => {
      render(<AuditLog />);
      act(() => {
        fireOpen();
        fireMessage({ ...sampleEntry, agentId: "agent-001", action: "bash", effect: "permit" });
        fireMessage({ ...sampleEntry, agentId: "agent-002", action: "grep", effect: "forbid" });
      });
      await waitFor(() => screen.getByText("agent-001"));
    });

    it("filters entries by agent", async () => {
      const user = userEvent.setup();
      const agentInput = screen.getByPlaceholderText("Filter by agent…");
      await user.type(agentInput, "agent-001");
      await waitFor(() => {
        expect(screen.getByText("agent-001")).toBeInTheDocument();
        expect(screen.queryByText("agent-002")).not.toBeInTheDocument();
      });
    });

    it("filters entries by action", async () => {
      const user = userEvent.setup();
      const actionInput = screen.getByPlaceholderText("Filter by action…");
      await user.type(actionInput, "grep");
      await waitFor(() => {
        expect(screen.getByText("grep")).toBeInTheDocument();
        expect(screen.queryByText("bash")).not.toBeInTheDocument();
      });
    });

    it("filters entries by effect", async () => {
      const user = userEvent.setup();
      const effectSelect = screen.getByRole("combobox");
      await user.selectOptions(effectSelect, "forbid");
      await waitFor(() => {
        expect(screen.getByText("FORBID")).toBeInTheDocument();
        expect(screen.queryByText("PERMIT")).not.toBeInTheDocument();
      });
    });

    it("shows 'No entries match' when filters exclude all entries", async () => {
      const user = userEvent.setup();
      await user.type(screen.getByPlaceholderText("Filter by agent…"), "agent-999");
      await waitFor(() => {
        expect(screen.getByText("No entries match the current filters.")).toBeInTheDocument();
      });
    });

    it("shows entry count with filter vs total", async () => {
      const user = userEvent.setup();
      await user.type(screen.getByPlaceholderText("Filter by agent…"), "agent-001");
      await waitFor(() => {
        expect(screen.getByText(/1 entry.*2 total/)).toBeInTheDocument();
      });
    });
  });

  describe("auto-scroll", () => {
    it("shows 'Pause scroll' button when auto-scroll is enabled", () => {
      render(<AuditLog />);
      expect(screen.getByRole("button", { name: "Pause scroll" })).toBeInTheDocument();
    });

    it("shows 'Resume scroll' after pausing", async () => {
      const user = userEvent.setup();
      render(<AuditLog />);
      await user.click(screen.getByRole("button", { name: "Pause scroll" }));
      expect(screen.getByRole("button", { name: "Resume scroll" })).toBeInTheDocument();
    });

    it("shows resume banner when auto-scroll is paused", async () => {
      const user = userEvent.setup();
      render(<AuditLog />);
      await user.click(screen.getByRole("button", { name: "Pause scroll" }));
      expect(screen.getByText(/New entries below/)).toBeInTheDocument();
    });

    it("resumes auto-scroll when resume banner is clicked", async () => {
      const user = userEvent.setup();
      render(<AuditLog />);
      await user.click(screen.getByRole("button", { name: "Pause scroll" }));
      await user.click(screen.getByText(/New entries below/));
      expect(screen.getByRole("button", { name: "Pause scroll" })).toBeInTheDocument();
    });
  });

  describe("copy entry", () => {
    it("copies entry as JSON and shows Copied! feedback", async () => {
      render(<AuditLog />);
      act(() => { fireOpen(); fireMessage(sampleEntry); });
      await waitFor(() => screen.getByText("agent-001"));

      const copyBtn = screen.getByRole("button", { name: "Copy" });
      fireEvent.click(copyBtn);

      await waitFor(() => {
        expect(writeTextMock).toHaveBeenCalled();
        expect(screen.getByText("Copied!")).toBeInTheDocument();
      });
    });

    it("does not include _clientId in copied JSON", async () => {
      render(<AuditLog />);
      act(() => { fireOpen(); fireMessage(sampleEntry); });
      await waitFor(() => screen.getByText("agent-001"));

      fireEvent.click(screen.getByRole("button", { name: "Copy" }));
      await waitFor(() => {
        expect(writeTextMock).toHaveBeenCalled();
        const copied: string = writeTextMock.mock.calls[0][0] as string;
        expect(JSON.parse(copied)).not.toHaveProperty("_clientId");
      });
    });
  });

  describe("entry count footer", () => {
    it("shows entry count", async () => {
      render(<AuditLog />);
      act(() => { fireOpen(); fireMessage(sampleEntry); });
      await waitFor(() => {
        expect(screen.getByText("1 entry")).toBeInTheDocument();
      });
    });

    it("shows plural 'entries' for multiple entries", async () => {
      render(<AuditLog />);
      act(() => {
        fireOpen();
        fireMessage(sampleEntry);
        fireMessage({ ...sampleEntry, agentId: "agent-002" });
      });
      await waitFor(() => {
        expect(screen.getByText("2 entries")).toBeInTheDocument();
      });
    });
  });
});
