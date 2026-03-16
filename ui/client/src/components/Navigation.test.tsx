import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Navigation } from "./Navigation";

function renderNav(initialPath = "/home") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Navigation />
    </MemoryRouter>
  );
}

describe("Navigation", () => {
  it("renders the brand name", () => {
    renderNav();
    expect(screen.getByText("Open Authority")).toBeInTheDocument();
  });

  it("renders all nav links", () => {
    renderNav();
    expect(screen.getByRole("link", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Authorities" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Audit Log" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Coverage Map" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings" })).toBeInTheDocument();
  });

  it("applies active class to the current route link", () => {
    renderNav("/home");
    const homeLink = screen.getByRole("link", { name: "Home" });
    expect(homeLink).toHaveClass("active");
  });

  it("does not apply active class to non-current route links", () => {
    renderNav("/home");
    const authLink = screen.getByRole("link", { name: "Authorities" });
    expect(authLink).not.toHaveClass("active");
  });

  it("marks Authorities as active on /authorities route", () => {
    renderNav("/authorities");
    const authLink = screen.getByRole("link", { name: "Authorities" });
    expect(authLink).toHaveClass("active");
    const homeLink = screen.getByRole("link", { name: "Home" });
    expect(homeLink).not.toHaveClass("active");
  });

  it("nav links have correct href attributes", () => {
    renderNav();
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/home");
    expect(screen.getByRole("link", { name: "Authorities" })).toHaveAttribute("href", "/authorities");
    expect(screen.getByRole("link", { name: "Audit Log" })).toHaveAttribute("href", "/audit-log");
    expect(screen.getByRole("link", { name: "Coverage Map" })).toHaveAttribute("href", "/coverage-map");
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
  });
});
