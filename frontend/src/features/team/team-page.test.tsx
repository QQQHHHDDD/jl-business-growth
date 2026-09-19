import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { Account, AuthResponse, TeamMember, TeamSnapshot } from "@/api/client";
import { listTeamMembers, listTeamSnapshots, saveTeamMember } from "@/api/client";
import { businessDate } from "@/lib/date";
import { TeamPage } from "./team-page";

vi.mock("@xyflow/react", () => ({
  ReactFlow: ({ nodes, edges, onNodeClick, children, fitView, panOnDrag }: { nodes: Array<{ id: string; data: { label: string }; style?: { width?: number; background?: string } }>; edges: Array<unknown>; onNodeClick?: (event: unknown, node: { id: string }) => void; children: ReactNode; fitView?: boolean; panOnDrag?: boolean }) => <div data-testid="react-flow" data-edge-count={edges.length} data-fit-view={String(fitView)} data-pan-on-drag={String(panOnDrag)}>{nodes.map((node) => <button key={node.id} type="button" data-node-width={node.style?.width} data-node-color={node.style?.background} onClick={() => onNodeClick?.({}, node)}>{node.data.label}</button>)}{children}</div>,
  Controls: () => <div><button type="button" aria-label="放大关系图">+</button><button type="button" aria-label="缩小关系图">-</button><button type="button" aria-label="适配关系图">fit</button></div>,
  Background: () => null,
}));

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
  node_color: "#2563eb",
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
  node_color: "#be123c",
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
  vi.mocked(saveTeamMember).mockResolvedValue({ data: parent, request_id: "request-save" });
});

describe("TeamPage", () => {
  it("defaults to the graph and opens member details and the shared editor sheet", async () => {
    renderPage();
    const graphTab = await screen.findByRole("tab", { name: "关系图" });
    expect(graphTab).toHaveAttribute("data-state", "active");
    expect(screen.getByRole("img", { name: "团队关系图" })).toBeVisible();
    expect(screen.getByTestId("react-flow")).toHaveAttribute("data-fit-view", "true");
    expect(screen.getByTestId("react-flow")).toHaveAttribute("data-pan-on-drag", "true");
    expect(screen.getByTestId("react-flow")).toHaveAttribute("data-edge-count", "1");
    expect(within(screen.getByTestId("team-graph")).queryByText("经理", { exact: true })).not.toBeInTheDocument();
    expect(within(screen.getByTestId("team-graph")).queryByText("上海", { exact: true })).not.toBeInTheDocument();
    expect(screen.getByLabelText("搜索成员").closest("header")).not.toBeNull();
    const graphButtons = within(screen.getByTestId("team-graph")).getAllByRole("button");
    const leaderNode = graphButtons.find((button) => button.textContent === "团队负责人");
    const partnerNode = graphButtons.find((button) => button.textContent === "业务伙伴");
    expect(Number(leaderNode?.dataset.nodeWidth)).toBeGreaterThan(Number(partnerNode?.dataset.nodeWidth));
    expect(leaderNode).toHaveAttribute("data-node-color", "#2563eb");
    expect(partnerNode).toHaveAttribute("data-node-color", "#be123c");

    fireEvent.click(within(screen.getByTestId("team-graph")).getByRole("button", { name: "团队负责人" }));
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByRole("heading", { name: "团队负责人" })).toBeVisible();
    fireEvent.click(screen.getByText("高级信息"));
    expect(screen.getByText("JL-001", { exact: true })).toBeVisible();
    expect(screen.getAllByText("业务伙伴", { exact: true }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "编辑成员" }));
    expect(screen.getByRole("heading", { name: "编辑成员" })).toBeVisible();
    expect(screen.getByLabelText("团队成员姓名")).toHaveValue("团队负责人");
    expect(screen.getByLabelText("自定义节点颜色")).toHaveValue("#2563eb");
    fireEvent.change(screen.getByLabelText("自定义节点颜色"), { target: { value: "#7c3aed" } });
    fireEvent.click(screen.getByRole("button", { name: "保存成员" }));
    await waitFor(() => expect(saveTeamMember).toHaveBeenCalledWith("csrf-token", expect.objectContaining({ node_color: "#7c3aed" }), parent.id));
  });

  it("provides searchable list and an independent snapshot view", async () => {
    renderPage();
    await screen.findByRole("tab", { name: "成员列表" });
    expect(screen.getByRole("button", { name: "保存快照" })).toBeVisible();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "成员列表" }), { button: 0 });
    expect(screen.getByLabelText("搜索成员").closest("header")).not.toBeNull();
    fireEvent.change(screen.getByLabelText("搜索成员"), { target: { value: "杭州" } });
    expect(screen.getByText("业务伙伴", { exact: true })).toBeVisible();
    expect(screen.getAllByRole("row")).toHaveLength(2);
    expect(screen.queryByText("JL-002", { exact: true })).not.toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole("tab", { name: "历史快照" }), { button: 0 });
    expect(screen.queryByLabelText("搜索成员")).not.toBeInTheDocument();
    expect(screen.getByText(/延迟捕获/)).toBeVisible();
    expect(screen.getByRole("heading", { name: "2026-08-01 团队结构" })).toBeVisible();
  });

  it("defaults a new member join date from the account timezone", async () => {
    renderPage();
    await screen.findByRole("button", { name: "新增成员" });
    fireEvent.click(screen.getByRole("button", { name: "新增成员" }));
    expect(screen.getByLabelText("加入日期")).toHaveValue(businessDate(account.timezone));
    expect(screen.getByLabelText("自定义节点颜色")).toHaveValue("#0f766e");
    fireEvent.click(screen.getByRole("button", { name: "选择节点颜色 #be123c" }));
    expect(screen.getByLabelText("自定义节点颜色")).toHaveValue("#be123c");
    fireEvent.click(screen.getByRole("button", { name: "恢复默认颜色" }));
    expect(screen.getByLabelText("自定义节点颜色")).toHaveValue("#0f766e");
  });

  it("restores a member deep link and exposes graph controls", async () => {
    renderPage(`/app/team?member=${child.id}`);
    expect(await screen.findByRole("heading", { name: "业务伙伴" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(screen.getByRole("button", { name: "放大关系图" })).toBeVisible();
    expect(screen.getByRole("button", { name: "适配关系图" })).toBeVisible();
  });

  it("does not scroll the document when returning to the relationship graph", async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scrollIntoView });
    renderPage();
    await screen.findByRole("tab", { name: "成员列表" });
    fireEvent.mouseDown(screen.getByRole("tab", { name: "成员列表" }), { button: 0 });
    fireEvent.change(screen.getByLabelText("搜索成员"), { target: { value: "业务伙伴" } });
    fireEvent.mouseDown(screen.getByRole("tab", { name: "关系图" }), { button: 0 });
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
