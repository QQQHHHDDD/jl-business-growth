import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { Account } from "@/api/client";
import { AppShell } from "./navigation";

const health = { isPending: false, isSuccess: true };
const user: Account = {
  id: "00000000-0000-0000-0000-000000000001",
  username: "owner",
  role: "USER",
  status: "ACTIVE",
  timezone: "Asia/Shanghai",
  created_at: "2026-01-01T00:00:00Z",
  last_login_at: null,
};

function renderShell(account = user, initialEntry = "/app") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AppShell account={account} health={health} admin={account.role !== "USER"} onLogout={() => undefined}>
        <main>内容</main>
      </AppShell>
    </MemoryRouter>,
  );
}

describe("AppShell", () => {
  it("opens and closes the mobile drawer with overlay and Escape while locking body scroll", () => {
    renderShell();

    expect(screen.queryByRole("dialog", { name: "应用导航" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "打开导航" }));
    expect(screen.getByRole("dialog", { name: "应用导航" })).toBeInTheDocument();
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "应用导航" })).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("");

    fireEvent.click(screen.getByRole("button", { name: "打开导航" }));
    fireEvent.click(screen.getByTestId("navigation-overlay"));
    expect(screen.queryByRole("dialog", { name: "应用导航" })).not.toBeInTheDocument();
  });

  it("keeps the user mobile navigation at four required destinations", () => {
    renderShell();

    const navigation = screen.getByRole("navigation", { name: "快捷导航" });
    expect(navigation).toHaveTextContent("首页");
    expect(navigation).toHaveTextContent("今日工作");
    expect(navigation).toHaveTextContent("日历");
    expect(navigation).toHaveTextContent("设置");
    expect(navigation.querySelectorAll("a")).toHaveLength(4);
  });

  it("adds the administrator entry to the super administrator mobile navigation", () => {
    renderShell({ ...user, username: "root", role: "SUPER_ADMIN" }, "/admin");

    const navigation = screen.getByRole("navigation", { name: "快捷导航" });
    expect(navigation).toHaveTextContent("管理首页");
    expect(navigation).toHaveTextContent("用户管理");
    expect(navigation).toHaveTextContent("邀请码");
    expect(navigation).toHaveTextContent("管理员管理");
    expect(navigation).toHaveTextContent("设置");
    expect(navigation.querySelectorAll("a")).toHaveLength(5);
  });
});
