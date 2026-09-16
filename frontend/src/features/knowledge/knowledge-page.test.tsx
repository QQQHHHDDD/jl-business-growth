import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Account, AuthResponse } from "@/api/client";
import { listFiles, listKnowledgeItems, listLearningSessions } from "@/api/client";
import { KnowledgePage } from "./knowledge-page";

vi.mock("@/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/client")>()),
  listKnowledgeItems: vi.fn(), listFiles: vi.fn(), listLearningSessions: vi.fn(),
  saveKnowledgeItem: vi.fn(), deleteKnowledgeItem: vi.fn(), saveLearningSession: vi.fn(), uploadFile: vi.fn(), deleteFile: vi.fn(),
}));

const account = { id: "00000000-0000-0000-0000-000000000001", username: "owner", role: "USER", status: "ACTIVE", timezone: "Asia/Shanghai", created_at: "2026-01-01T00:00:00Z", last_login_at: null } as Account;
const authResponse = { data: { account, accounts: [{ ...account, active: true }], csrf_token: "csrf" }, request_id: "1" } as AuthResponse;
function renderPage() { const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); return render(<QueryClientProvider client={client}><KnowledgePage authResponse={authResponse} /></QueryClientProvider>); }

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listKnowledgeItems).mockResolvedValue({ data: { items: [{ id: "00000000-0000-0000-0000-000000000002", title: "经营方法", type: "BOOK", raw_text: "持续学习", summary: null, understanding: null, action_items: null, source_url: null, learned_on: null, status: "IN_PROGRESS", progress_current: 20, progress_total: 100, progress_unit: "页", tags: ["经营"], file_ids: [], created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-16T00:00:00Z" }] }, request_id: "2" });
  vi.mocked(listFiles).mockResolvedValue({ data: { items: [] }, request_id: "3" });
  vi.mocked(listLearningSessions).mockResolvedValue({ data: { items: [] }, request_id: "4" });
});

describe("KnowledgePage", () => {
  it("provides project filters, an editor sheet, and an attachment tab", async () => {
    renderPage();
    expect(await screen.findByRole("tab", { name: "学习项目" })).toHaveAttribute("data-state", "active");
    expect(screen.getByLabelText("搜索学习项目")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "新增学习" }));
    expect(screen.getByRole("heading", { name: "新增学习项目" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    fireEvent.mouseDown(screen.getByRole("tab", { name: "附件库" }), { button: 0 });
    expect(screen.getByRole("heading", { name: "附件库" })).toBeVisible();
  });
});
