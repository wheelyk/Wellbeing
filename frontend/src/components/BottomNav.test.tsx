import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { BottomNav } from "./BottomNav";

describe("BottomNav", () => {
  it("renders all four primary links with the correct hrefs", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <BottomNav />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: /Home/ })).toHaveAttribute("href", "/dashboard");
    expect(screen.getByRole("link", { name: /History/ })).toHaveAttribute("href", "/history");
    expect(screen.getByRole("link", { name: /Trends/ })).toHaveAttribute("href", "/trends");
    expect(screen.getByRole("link", { name: /Settings/ })).toHaveAttribute("href", "/settings");
  });

  it("highlights the active route and leaves the others unhighlighted", () => {
    render(
      <MemoryRouter initialEntries={["/history"]}>
        <BottomNav />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: /History/ }).className).toContain("text-brand");
    expect(screen.getByRole("link", { name: /Home/ }).className).not.toContain("text-brand");
    expect(screen.getByRole("link", { name: /Trends/ }).className).not.toContain("text-brand");
    expect(screen.getByRole("link", { name: /Settings/ }).className).not.toContain("text-brand");
  });

  it("stays fixed to the bottom of the viewport and hidden from md: up", () => {
    // jsdom has no real layout engine and doesn't load the compiled Tailwind stylesheet (the
    // same caveat NavBar.test.tsx documents for its own breakpoint test), so this can't verify
    // actual visibility or position - it's a structural regression guard that fails loudly if a
    // future edit drops `fixed`, `bottom-0`, or `md:hidden` without anyone noticing.
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <BottomNav />
      </MemoryRouter>,
    );

    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(nav.className).toContain("fixed");
    expect(nav.className).toContain("bottom-0");
    expect(nav.className).toContain("md:hidden");
  });
});
