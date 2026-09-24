import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Account, AuthResponse, CommunicationFriendRecord } from "@/api/client";
import { listCommunicationFriendRecords, listCommunicationScriptCategories, listCommunicationScripts, saveCommunicationFriendRecord, saveCommunicationScript } from "@/api/client";
import { CommunicationPage } from "./communication-page";

vi.mock("@/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/client")>()),
  listCommunicationFriendRecords: vi.fn(),
  listCommunicationScriptCategories: vi.fn(),
  listCommunicationScripts: vi.fn(),
  saveCommunicationFriendRecord: vi.fn(),
  saveCommunicationScript: vi.fn(),
}));

const account = { id: "00000000-0000-0000-0000-000000000001", username: "user", role: "USER", status: "ACTIVE", timezone: "Asia/Shanghai", created_at: "2026-01-01T00:00:00Z", last_login_at: null } as Account;
const authResponse = { data: { account, accounts: [{ ...account, active: true }], csrf_token: "csrf" }, request_id: "request-1" } as AuthResponse;
const friendRecord: CommunicationFriendRecord = {
  id: "00000000-0000-0000-0000-000000000020",
  platform: "微信",
  account_label: "账号一",
  group_name: "成长群",
  add_direction: "FORWARD",
  last_applied_person: "小李",
  application_script: "你好，我想认识你",
  first_message: "通过后第一句话",
  note: "旧备注",
  archived: false,
  created_at: "2026-09-22T00:00:00Z",
  updated_at: "2026-09-22T00:00:00Z",
};

function renderPage(entry = "/app/communication") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<MemoryRouter initialEntries={[entry]}><QueryClientProvider client={client}><CommunicationPage authResponse={authResponse} /></QueryClientProvider></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listCommunicationFriendRecords).mockResolvedValue({ data: { items: [] }, meta: { page: 1, page_size: 20, total: 0 }, request_id: "friend-list" });
  vi.mocked(listCommunicationScriptCategories).mockResolvedValue({ data: { items: [] }, request_id: "category-list" });
  vi.mocked(listCommunicationScripts).mockResolvedValue({ data: { items: [{ id: "00000000-0000-0000-0000-000000000010", category_id: null, category_name: "", title: "导师故事", script_type: "STAGE", tags: ["故事"], paragraphs: ["第一段", "第二段"], note: "不复制", favorite: true, created_at: "2026-09-22T00:00:00Z", updated_at: "2026-09-22T00:00:00Z" }] }, meta: { page: 1, page_size: 20, total: 1 }, request_id: "script-list" });
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
  vi.mocked(saveCommunicationFriendRecord).mockRejectedValue(new Error("记录保存失败"));
  vi.mocked(saveCommunicationScript).mockRejectedValue(new Error("话术保存失败"));
});

describe("CommunicationPage", () => {
  it("opens friend records by default and keeps the scripts tab in the URL", async () => {
    renderPage();
    expect(await screen.findByText("还没有加好友记录")).toBeVisible();
    fireEvent.mouseDown(screen.getByRole("tab", { name: /话术库/ }));
    expect(await screen.findByText("导师故事")).toBeVisible();
    expect(window.location.href).not.toContain("calendar");
  });

  it("copies only ordered script paragraphs", async () => {
    renderPage("/app/communication?tab=scripts");
    fireEvent.click(await screen.findByRole("button", { name: "复制全部" }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith("第一段\n\n第二段"));
    expect(navigator.clipboard.writeText).not.toHaveBeenCalledWith(expect.stringContaining("不复制"));
  });

  it("keeps the selected script category in the URL and preselects it for new scripts", async () => {
    const category = { id: "00000000-0000-0000-0000-000000000099", name: "Buffer", sort_order: 0, created_at: "2026-09-22T00:00:00Z", updated_at: "2026-09-22T00:00:00Z" };
    vi.mocked(listCommunicationScriptCategories).mockResolvedValue({ data: { items: [category] }, request_id: "category-list" });
    renderPage(`/app/communication?tab=scripts&category=${category.id}`);
    const categoryFilter = await screen.findByRole("combobox", { name: "按分类筛选" });
    await waitFor(() => expect(categoryFilter).toHaveValue(category.id));
    fireEvent.click(screen.getByRole("button", { name: "新增话术" }));
    const selects = screen.getAllByRole("combobox");
    expect(selects[selects.length - 1]).toHaveValue(category.id);
  });

  it("marks required communication fields and keeps optional copy fields unmarked", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "新增记录" }));
    expect(screen.getByLabelText("平台")).toBeRequired();
    expect(screen.getByLabelText("账号")).toBeRequired();
    expect(screen.getByLabelText("群名称")).toBeRequired();
    expect(screen.getByLabelText("好友申请话术")).not.toBeRequired();
    expect(screen.getByText("平台").parentElement?.querySelector("span[aria-hidden='true']")).toHaveClass("after:content-['*']", "text-rose-600");
  });

  it("keeps create and edit friend-record errors inside the scroll body with a fixed footer", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "新增记录" }));
    expect(screen.getByRole("dialog")).toHaveClass("overflow-hidden");
    expect(screen.getByTestId("communication-dialog-scroll")).toHaveClass("overflow-y-auto");
    expect(screen.getByTestId("communication-dialog-footer")).toHaveClass("shrink-0");
    fireEvent.change(screen.getByLabelText("平台"), { target: { value: "微信" } });
    fireEvent.change(screen.getByLabelText("账号"), { target: { value: "账号一" } });
    fireEvent.change(screen.getByLabelText("群名称"), { target: { value: "成长群" } });
    fireEvent.change(screen.getByLabelText("备注"), { target: { value: "长内容".repeat(200) } });
    fireEvent.click(screen.getByRole("button", { name: "保存记录" }));
    expect(await screen.findByText("记录保存失败")).toBeVisible();
  });

  it("fills a new record from the latest record without copying progress", async () => {
    vi.mocked(listCommunicationFriendRecords).mockResolvedValue({
      data: { items: [friendRecord] },
      meta: { page: 1, page_size: 1, total: 1 },
      request_id: "friend-template",
    });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "新增记录" }));
    fireEvent.click(await screen.findByRole("button", { name: "填入上一个记录" }));
    expect(screen.getByLabelText("平台")).toHaveValue("微信");
    expect(screen.getByLabelText("账号")).toHaveValue("账号一");
    expect(screen.getByLabelText("群名称")).toHaveValue("成长群");
    expect(screen.getByLabelText("好友申请话术")).toHaveValue("你好，我想认识你");
    expect(screen.getByLabelText("通过后第一句话")).toHaveValue("通过后第一句话");
    expect(screen.getByLabelText("备注")).toHaveValue("旧备注");
    expect(screen.getByLabelText("最后申请的人")).toHaveValue("");
  });

  it("copies both friend-record scripts without changing the table layout", async () => {
    vi.mocked(listCommunicationFriendRecords).mockResolvedValue({
      data: { items: [friendRecord] },
      meta: { page: 1, page_size: 20, total: 1 },
      request_id: "friend-list",
    });
    renderPage();
    const applicationButtons = await screen.findAllByRole("button", { name: "申请话术" });
    fireEvent.click(applicationButtons[0]);
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("你好，我想认识你"),
    );
    expect(await screen.findByRole("status")).toHaveClass("fixed", "z-[100]");
    expect(screen.getByRole("status")).toHaveTextContent("好友申请话术已复制。");
    const firstMessageButtons = screen.getAllByRole("button", { name: "第一句话" });
    fireEvent.click(firstMessageButtons[0]);
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("通过后第一句话"),
    );
    expect(screen.getAllByLabelText("顺序，向下添加").length).toBeGreaterThan(0);
    expect(screen.getByTestId("friend-record-table")).not.toHaveClass("min-w-[860px]");
  });

  it("shows an upward arrow for reverse direction", async () => {
    vi.mocked(listCommunicationFriendRecords).mockResolvedValue({
      data: { items: [{ ...friendRecord, add_direction: "REVERSE" }] },
      meta: { page: 1, page_size: 20, total: 1 },
      request_id: "friend-list",
    });
    renderPage();
    expect(await screen.findAllByLabelText("逆序，向上添加")).not.toHaveLength(0);
  });

  it("keeps archive and delete inside the more-actions menu", async () => {
    vi.mocked(listCommunicationFriendRecords).mockResolvedValue({
      data: { items: [friendRecord] },
      meta: { page: 1, page_size: 20, total: 1 },
      request_id: "friend-list",
    });
    renderPage();
    fireEvent.click((await screen.findAllByLabelText("更多操作"))[0]);
    expect((await screen.findAllByRole("menuitem", { name: "编辑" })).length).toBeGreaterThan(0);
    expect((await screen.findAllByRole("menuitem", { name: "归档" })).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("menuitem", { name: "删除" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("menu")[0]).toHaveClass("fixed", "z-[1000]");
    expect(screen.getAllByRole("menu")[0].parentElement).toBe(document.body);
    expect(screen.getByRole("heading", { name: "加好友记录" }).closest("section")).toHaveClass("overflow-hidden");
  });

  it("automatically dismisses the copy notice", async () => {
    vi.mocked(listCommunicationFriendRecords).mockResolvedValue({
      data: { items: [friendRecord] },
      meta: { page: 1, page_size: 20, total: 1 },
      request_id: "friend-list",
    });
    renderPage();
    const applicationButton = (await screen.findAllByRole("button", { name: "申请话术" }))[0];
    vi.useFakeTimers();
    try {
      fireEvent.click(applicationButton);
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(screen.getByRole("status")).toHaveTextContent("好友申请话术已复制。");
      act(() => vi.advanceTimersByTime(3000));
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps edit friend-record errors inside the same bounded layout", async () => {
    vi.mocked(listCommunicationFriendRecords).mockResolvedValue({
      data: { items: [{ id: "00000000-0000-0000-0000-000000000020", platform: "微信", account_label: "账号一", group_name: "成长群", add_direction: "FORWARD", last_applied_person: "小李", application_script: "申请话术", first_message: "你好", note: "旧备注", archived: false, created_at: "2026-09-22T00:00:00Z", updated_at: "2026-09-22T00:00:00Z" }] },
      meta: { page: 1, page_size: 20, total: 1 },
      request_id: "friend-list",
    });
    renderPage();
    fireEvent.click((await screen.findAllByLabelText("更多操作"))[0]);
    fireEvent.click((await screen.findAllByRole("menuitem", { name: "编辑" }))[0]);
    expect(screen.getByLabelText("群名称")).toHaveValue("成长群");
    fireEvent.change(screen.getByLabelText("备注"), { target: { value: "编辑长内容".repeat(200) } });
    fireEvent.click(screen.getByRole("button", { name: "保存记录" }));
    expect(await screen.findByText("记录保存失败")).toBeVisible();
    expect(screen.getByTestId("communication-dialog-footer")).toHaveClass("shrink-0");
  });

  it("keeps create and edit script errors inside the bounded dialog", async () => {
    renderPage("/app/communication?tab=scripts");
    fireEvent.click(await screen.findByRole("button", { name: "新增话术" }));
    expect(screen.getByRole("dialog")).toHaveClass("overflow-hidden");
    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "Buffer" } });
    fireEvent.change(screen.getByPlaceholderText("第 1 段"), { target: { value: "正文".repeat(200) } });
    fireEvent.click(screen.getByRole("button", { name: "保存话术" }));
    expect(await screen.findByText("话术保存失败")).toBeVisible();
    expect(screen.getByTestId("communication-dialog-footer")).toHaveClass("shrink-0");
  });

  it("keeps edit script errors inside the same bounded layout", async () => {
    renderPage("/app/communication?tab=scripts");
    fireEvent.click((await screen.findAllByLabelText("更多操作"))[0]);
    fireEvent.click((await screen.findAllByRole("menuitem", { name: "编辑" }))[0]);
    expect(screen.getByLabelText("标题")).toHaveValue("导师故事");
    expect(screen.getByPlaceholderText("第 1 段")).toHaveClass("min-h-24", "w-full");
    expect(screen.getByLabelText("使用备注")).toHaveClass("min-h-24", "w-full");
    fireEvent.change(screen.getByPlaceholderText("第 1 段"), { target: { value: "编辑正文".repeat(200) } });
    fireEvent.click(screen.getByRole("button", { name: "保存话术" }));
    expect(await screen.findByText("话术保存失败")).toBeVisible();
    expect(screen.getByTestId("communication-dialog-scroll")).toHaveClass("overflow-y-auto");
  });
});
