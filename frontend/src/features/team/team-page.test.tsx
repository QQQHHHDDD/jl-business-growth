import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Account, AuthResponse, TeamMember, TeamSnapshot } from "@/api/client";
import { listTeamMembers, listTeamSnapshots } from "@/api/client";
import { TeamPage } from "./team-page";

vi.mock("@/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/client")>();
  return {
    ...actual,
    listTeamMembers: vi.fn(),
    listTeamSnapshots: vi.fn(),
    saveTeamMember: vi.fn(),
    deleteTeamMember: vi.fn(),
    createTeamSnapshot: vi.fn(),
  };
});

const account = {
  id: "00000000-0000-0000-0000-000000000001",
  username: "owner",
  role: "USER",
  status: "ACTIVE",
  timezone: "Asia/Shanghai",
  created_at: "2026-01-01T00:00:00Z",
  last_login_at: null,
} as Account;
const authResponse = {
  data: { account, accounts: [{ ...account, active: true }], csrf_token: "csrf-token" },
  request_id: "request-1",
} as AuthResponse;
const parent = {
  id: "00000000-0000-0000-0000-000000000010",
  member_code: "JL-001",
  parent_id: null,
  name: "团队负责人",
  joined_on: "2026-01-01",
  rank: "经理",
  city: "上海",
  status: "ACTIVE",
  note: "根节点",
  sort_order: 0,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
} as TeamMember;
const child = {
  ...parent,
  id: "00000000-0000-0000-0000-000000000011",
  member_code: "JL-002",
  parent_id: parent.id,
  name: "业务伙伴",
  rank: "顾问",
  city: "杭州",
  note: null,
} as TeamMember;
const snapshot = {
  id: "00000000-0000-0000-0000-000000000020",
  snapshot_month: "2026-08-01",
  snapshot_type: "MANUAL",
  captured_at: "2026-09-01T00:00:00Z",
  captured_late: true,
  members: [
    {
      id: "00000000-0000-0000-0000-000000000021",
      original_member_id: parent.id,
      parent_id: null,
      name: parent.name,
      joined_on: parent.joined_on,
      rank: parent.rank,
      city: parent.city,
      status: parent.status,
      note: parent.note,
      sort_order: 0,
    },
  ],
} as TeamSnapshot;

function renderPage(entry = "/app/team") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<MemoryRouter initialEntries={[entry]}><QueryClientProvider client={client}><TeamPage authResponse={authResponse} /></QueryClientProvider></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listTeamMembers).mockResolvedValue({ data: { items: [parent, child] }, request_id: "request-2" });
  vi.mocked(listTeamSnapshots).mockResolvedValue({ data: { items: [snapshot] }, request_id: "request-3" });
});

describe("TeamPage", () => {
  it("defaults to the graph and opens member details and the shared editor sheet", async () => {
    renderPage();
    const graphTab = await screen.findByRole("tab", { name: "关系图" });
    expect(graphTab).toHaveAttribute("data-state", "active");
    expect(screen.getByRole("img", { name: "团队关系图" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /团队负责人/ }));
    expect(screen.getByRole("heading", { name: "团队负责人" })).toBeVisible();
    fireEvent.click(screen.getByText("高级信息"));
    expect(screen.getByText("JL-001", { exact: true })).toBeVisible();
    expect(screen.getAllByText("业务伙伴", { exact: true }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "编辑成员" }));
    expect(screen.getByRole("heading", { name: "编辑成员" })).toBeVisible();
    expect(screen.getByLabelText("团队成员姓名")).toHaveValue("团队负责人");
  });

  it("provides searchable list and an independent snapshot view", async () => {
    renderPage();
    await screen.findByRole("tab", { name: "成员列表" });
    expect(screen.getByRole("button", { name: "保存快照" })).toBeVisible();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "成员列表" }), { button: 0 });
    fireEvent.change(screen.getByLabelText("搜索成员"), { target: { value: "杭州" } });
    expect(screen.getByText("业务伙伴", { exact: true })).toBeVisible();
    expect(screen.getAllByRole("row")).toHaveLength(2);
    expect(screen.queryByText("JL-002", { exact: true })).not.toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole("tab", { name: "历史快照" }), { button: 0 });
    expect(screen.getByText(/延迟捕获/)).toBeVisible();
    expect(screen.getByRole("heading", { name: "2026-08-01 团队结构" })).toBeVisible();
  });

  it("restores a member deep link and exposes graph controls", async () => {
    renderPage(`/app/team?member=${child.id}`);
    expect(await screen.findByRole("heading", { name: "业务伙伴" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(screen.getByRole("button", { name: "放大关系图" })).toBeVisible();
    expect(screen.getByRole("button", { name: "适配关系图" })).toBeVisible();
  });
});
