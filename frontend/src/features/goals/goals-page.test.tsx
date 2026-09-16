import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Account, AuthResponse, Dream, Goal } from "@/api/client";
import { listDreams, listFiles, listGoals } from "@/api/client";
import { GoalsPage } from "./goals-page";

vi.mock("@xyflow/react", () => ({
  ReactFlow: ({ nodes, onNodeClick, children }: { nodes: Array<{ id: string; data: { label: string } }>; onNodeClick: (event: unknown, node: { id: string }) => void; children: ReactNode }) => (
    <div data-testid="goal-map">
      {nodes.map((node) => (
        <button key={node.id} type="button" onClick={() => onNodeClick({}, node)}>
          {node.data.label}
        </button>
      ))}
      {children}
    </div>
  ),
  MiniMap: () => null,
  Controls: () => null,
  Background: () => null,
}));

vi.mock("@/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/client")>();
  return {
    ...actual,
    listGoals: vi.fn(),
    listDreams: vi.fn(),
    listFiles: vi.fn(),
    saveGoal: vi.fn(),
    saveDream: vi.fn(),
    uploadFile: vi.fn(),
    deleteGoal: vi.fn(),
    deleteDream: vi.fn(),
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
const parentGoal = {
  id: "00000000-0000-0000-0000-000000000010",
  parent_id: null,
  type: "YEAR",
  title: "年度增长目标",
  description: null,
  start_date: "2026-01-01",
  due_date: "2026-12-31",
  status: "IN_PROGRESS",
  sort_order: 0,
  metrics: [{ metric_code: "meeting_count", target_value: 10, unit: "次", actual_value: 4, progress: 0.4 }],
  progress: 0.4,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
} as Goal;
const childGoal = {
  ...parentGoal,
  id: "00000000-0000-0000-0000-000000000011",
  parent_id: parentGoal.id,
  type: "MONTH",
  title: "本月会面目标",
} as Goal;
const dream = {
  id: "00000000-0000-0000-0000-000000000020",
  title: "有节奏地经营",
  description: "持续推进重要目标",
  goal_ids: [parentGoal.id],
  file_ids: [],
  sort_order: 0,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
} as Dream;

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <GoalsPage authResponse={authResponse} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listGoals).mockResolvedValue({ data: { items: [parentGoal, childGoal] }, request_id: "request-2" });
  vi.mocked(listDreams).mockResolvedValue({ data: { items: [dream] }, request_id: "request-3" });
  vi.mocked(listFiles).mockResolvedValue({ data: { items: [] }, request_id: "request-4" });
});

describe("GoalsPage", () => {
  it("defaults to the map and opens accessible create and detail sheets", async () => {
    renderPage();

    const mapTab = await screen.findByRole("tab", { name: "目标地图" });
    expect(mapTab).toHaveAttribute("data-state", "active");
    expect(screen.getByTestId("goal-map")).toBeVisible();

    const createButton = screen.getByRole("button", { name: "新建目标" });
    createButton.focus();
    fireEvent.click(createButton);
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByRole("heading", { name: "新建目标" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(createButton).toHaveFocus());

    fireEvent.click(createButton);
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /年度增长目标/ }));
    expect(screen.getByRole("heading", { name: "年度增长目标" })).toBeVisible();
    expect(screen.getByText("本月会面目标", { exact: true })).toBeVisible();
  });

  it("separates list and dream views while retaining dream goal links", async () => {
    renderPage();
    await screen.findByRole("tab", { name: "目标列表" });

    fireEvent.mouseDown(screen.getByRole("tab", { name: "目标列表" }), { button: 0 });
    expect(screen.getByLabelText("搜索目标")).toBeVisible();
    expect(screen.getAllByText("40%")[0]).toBeVisible();

    fireEvent.mouseDown(screen.getByRole("tab", { name: "梦想板" }), { button: 0 });
    expect(screen.getByRole("heading", { name: "有节奏地经营" })).toBeVisible();
    expect(screen.getByText("关联目标 1")).toBeVisible();
    fireEvent.click(screen.getByRole("heading", { name: "有节奏地经营" }).closest("button")!);
    expect(screen.getByRole("heading", { name: "编辑梦想" })).toBeVisible();
    expect(screen.getByRole("checkbox", { name: "年度增长目标" })).toBeChecked();
  });
});
