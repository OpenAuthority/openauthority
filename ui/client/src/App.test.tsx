import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "./App";

// Mock child views that make API/SSE calls so routing tests stay simple
vi.mock("./views/RulesTable", () => ({
  RulesTable: () => <div data-testid="rules-table">RulesTable</div>,
}));
vi.mock("./views/RuleEditor", () => ({
  RuleEditor: () => <div data-testid="rule-editor">RuleEditor</div>,
}));
vi.mock("./views/AuditLog", () => ({
  AuditLog: () => <div data-testid="audit-log">AuditLog</div>,
}));
vi.mock("./views/CoverageMap", () => ({
  CoverageMap: () => <div data-testid="coverage-map">CoverageMap</div>,
}));

// jsdom doesn't implement window.scrollIntoView
beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

describe("App routing", () => {
  it("redirects / to /home", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Open Authority" })).toBeInTheDocument();
  });

  it("renders Navigation on every route", () => {
    render(<App />);
    expect(screen.getByRole("link", { name: "Home" })).toBeInTheDocument();
  });

  it("renders Home page content at /home", () => {
    render(<App />);
    expect(screen.getByText(/Welcome to the Open Authority/i)).toBeInTheDocument();
  });
});
