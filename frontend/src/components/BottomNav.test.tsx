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

  it("renders all four links plus a centerAction when one is passed, in link/link/action/link/link order", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <BottomNav centerAction={<button>Quick add</button>} />
      </MemoryRouter>,
    );

    const nav = screen.getByRole("navigation", { name: "Primary" });
    const itemNames = Array.from(nav.children).map((child) =>
      child.textContent?.replace(/\s+/g, " ").trim(),
    );
    expect(itemNames).toEqual(["🏠Home", "🕘History", "Quick add", "📈Trends", "⚙️Settings"]);
  });

  it("omits the centerAction slot entirely when none is passed", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <BottomNav />
      </MemoryRouter>,
    );

    expect(screen.queryByRole("button", { name: "Quick add" })).not.toBeInTheDocument();
  });
});
