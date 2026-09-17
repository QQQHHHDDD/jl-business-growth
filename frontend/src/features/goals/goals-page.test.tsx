import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Account, AuthResponse, Dream, FileAsset, Goal } from "@/api/client";
import { deleteFile, listDreams, listFiles, listGoals, saveDream, saveGoal, uploadFile } from "@/api/client";
import { businessDate } from "@/lib/date";
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
    deleteFile: vi.fn(),
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

function dreamImage(id: string, name: string): FileAsset {
  return { id, category: "DREAM_IMAGE", original_name: name, mime_type: "image/png", size_bytes: 4, sha256: `hash-${id}`, created_at: "2026-01-01T00:00:00Z" };
}

function renderPage(entry = "/app/goals") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[entry]}><QueryClientProvider client={client}>
      <GoalsPage authResponse={authResponse} />
    </QueryClientProvider></MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listGoals).mockResolvedValue({ data: { items: [parentGoal, childGoal] }, request_id: "request-2" });
  vi.mocked(listDreams).mockResolvedValue({ data: { items: [dream] }, request_id: "request-3" });
  vi.mocked(listFiles).mockResolvedValue({ data: { items: [] }, request_id: "request-4" });
  vi.mocked(saveGoal).mockResolvedValue({ data: parentGoal, request_id: "request-5" });
  vi.mocked(saveDream).mockResolvedValue({ data: dream, request_id: "request-dream" });
  vi.mocked(deleteFile).mockResolvedValue(undefined);
  vi.mocked(uploadFile).mockResolvedValue({ data: { id: "00000000-0000-0000-0000-000000000030", category: "DREAM_IMAGE", original_name: "dream.png", mime_type: "image/png", size_bytes: 4, sha256: "hash", created_at: "2026-01-01T00:00:00Z" }, request_id: "request-6" });
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
    expect(screen.getByLabelText("开始日期")).toHaveValue(businessDate(account.timezone));
    expect(screen.getByLabelText("截止日期")).toHaveValue(businessDate(account.timezone));
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
    expect(screen.getByRole("heading", { name: "有节奏地经营" })).toBeVisible();
    expect(within(screen.getByRole("dialog")).getByText("持续推进重要目标")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "编辑梦想" }));
    expect(screen.getByRole("heading", { name: "编辑梦想" })).toBeVisible();
    expect(screen.getByRole("checkbox", { name: "年度增长目标" })).toBeChecked();
  });

  it("creates a non-quantified goal with only a title", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "新建目标" }));
    fireEvent.change(screen.getByLabelText("目标名称"), { target: { value: "只含名称的目标" } });
    fireEvent.click(screen.getByRole("button", { name: "创建目标" }));
    await waitFor(() => expect(saveGoal).toHaveBeenCalledWith("csrf-token", expect.objectContaining({ title: "只含名称的目标", metrics: [] }), undefined));
  });

  it("uploads a selected dream image without a second upload action", async () => {
    renderPage();
    fireEvent.mouseDown(await screen.findByRole("tab", { name: "梦想板" }), { button: 0 });
    fireEvent.click(screen.getByRole("button", { name: "新增梦想" }));
    const file = new File(["data"], "dream.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("选择梦想图片"), { target: { files: [file] } });
    await waitFor(() => expect(uploadFile).toHaveBeenCalledWith("csrf-token", file, "DREAM_IMAGE"));
    expect(screen.queryByRole("button", { name: "上传" })).not.toBeInTheDocument();
  });

  it("uploads multiple dream images and rejects selections above ten", async () => {
    const firstAsset = dreamImage("00000000-0000-0000-0000-000000000031", "first.png");
    const secondAsset = dreamImage("00000000-0000-0000-0000-000000000032", "second.png");
    vi.mocked(uploadFile).mockResolvedValueOnce({ data: firstAsset, request_id: "upload-1" }).mockResolvedValueOnce({ data: secondAsset, request_id: "upload-2" });
    renderPage();
    fireEvent.mouseDown(await screen.findByRole("tab", { name: "梦想板" }), { button: 0 });
    fireEvent.click(screen.getByRole("button", { name: "新增梦想" }));
    const first = new File(["first"], "first.png", { type: "image/png" });
    const second = new File(["second"], "second.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("选择梦想图片"), { target: { files: [first, second] } });
    await waitFor(() => expect(uploadFile).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("2 / 10")).toBeVisible();

    const tooMany = Array.from({ length: 9 }, (_, index) => new File([String(index)], `extra-${index}.png`, { type: "image/png" }));
    fireEvent.change(screen.getByLabelText("选择梦想图片"), { target: { files: tooMany } });
    expect(await screen.findByRole("alert")).toHaveTextContent("一个梦想最多可添加 10 张图片");
    expect(uploadFile).toHaveBeenCalledTimes(2);
  });

  it("persists image order and removes an existing dream image", async () => {
    const first = dreamImage("00000000-0000-0000-0000-000000000041", "first.png");
    const second = dreamImage("00000000-0000-0000-0000-000000000042", "second.png");
    const multiDream = { ...dream, file_ids: [first.id, second.id] };
    vi.mocked(listDreams).mockResolvedValue({ data: { items: [multiDream] }, request_id: "dreams-multi" });
    vi.mocked(listFiles).mockResolvedValue({ data: { items: [first, second] }, request_id: "files-multi" });
    vi.mocked(saveDream).mockResolvedValue({ data: { ...multiDream, file_ids: [second.id] }, request_id: "saved" });
    renderPage();
    fireEvent.mouseDown(await screen.findByRole("tab", { name: "梦想板" }), { button: 0 });
    fireEvent.click(screen.getByRole("heading", { name: dream.title }).closest("button")!);
    fireEvent.click(screen.getByRole("button", { name: "编辑梦想" }));
    fireEvent.click(screen.getByRole("button", { name: "后移图片 first.png" }));
    fireEvent.click(screen.getByRole("button", { name: "删除图片 first.png" }));
    fireEvent.click(screen.getByRole("button", { name: "保存梦想" }));
    await waitFor(() => expect(saveDream).toHaveBeenCalledWith("csrf-token", expect.objectContaining({ file_ids: [second.id] }), dream.id));
    await waitFor(() => expect(deleteFile).toHaveBeenCalledWith("csrf-token", first.id));
  });

  it("navigates the ordered dream image carousel", async () => {
    const first = dreamImage("00000000-0000-0000-0000-000000000051", "first.png");
    const second = dreamImage("00000000-0000-0000-0000-000000000052", "second.png");
    vi.mocked(listDreams).mockResolvedValue({ data: { items: [{ ...dream, file_ids: [first.id, second.id] }] }, request_id: "dreams-carousel" });
    vi.mocked(listFiles).mockResolvedValue({ data: { items: [first, second] }, request_id: "files-carousel" });
    renderPage();
    fireEvent.mouseDown(await screen.findByRole("tab", { name: "梦想板" }), { button: 0 });
    fireEvent.click(screen.getByRole("heading", { name: dream.title }).closest("button")!);
    expect(screen.getByText("1 / 2")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "下一张梦想图片" }));
    expect(screen.getByText("2 / 2")).toBeVisible();
    expect(screen.getByRole("img", { name: "second.png" })).toBeVisible();
  });

  it("restores a record-level goal deep link after refresh", async () => {
    renderPage(`/app/goals?goal=${childGoal.id}`);
    expect(await screen.findByRole("heading", { name: "本月会面目标" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(screen.getByRole("tab", { name: "目标列表" })).toHaveAttribute("data-state", "active");
  });
});
