import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Account, AuthResponse, ImportJob } from "@/api/client";
import { commitImport, createImport } from "@/api/client";
import { DataPage } from "./data-page";

vi.mock("@/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/client")>()),
  createImport: vi.fn(),
  validateImport: vi.fn(),
  commitImport: vi.fn(),
  deleteImport: vi.fn(),
  downloadImportTemplate: vi.fn(),
  exportData: vi.fn(),
}));

const account = { id: "00000000-0000-0000-0000-000000000001", username: "owner", role: "USER", status: "ACTIVE", timezone: "Asia/Shanghai", created_at: "2026-01-01T00:00:00Z", last_login_at: null } as Account;
const authResponse = { data: { account, accounts: [{ ...account, active: true }], csrf_token: "csrf" }, request_id: "1" } as AuthResponse;
const validatedJob = { id: "00000000-0000-0000-0000-000000000010", type: "WORKLOG", status: "VALIDATED", row_count: 1, valid_count: 1, invalid_count: 0, validation_summary: { insert: 1, update: 0, skip: 0 }, warnings: [], expires_at: "2026-09-17T00:00:00Z", created_at: "2026-09-16T00:00:00Z", rows: [{ row_number: 2, values: { work_date: "2026-09-16" }, errors: [], warnings: [] }] } as ImportJob;

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><DataPage authResponse={authResponse} /></QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createImport).mockResolvedValue({ data: validatedJob, request_id: "2" });
  vi.mocked(commitImport).mockResolvedValue({ data: { ...validatedJob, status: "COMMITTED" }, request_id: "3" });
});

describe("DataPage", () => {
  it("renders only the active import step and commits only after step five confirmation", async () => {
    renderPage();
    const stepList = screen.getByRole("list", { name: "导入步骤" });
    for (const label of ["选择类型", "下载模板", "上传文件", "校验预览", "确认导入"]) expect(stepList).toHaveTextContent(label);
    expect(screen.getByRole("heading", { name: "选择类型" })).toBeVisible();
    expect(screen.queryByLabelText("选择 XLSX 文件")).not.toBeInTheDocument();
    expect(screen.getByText("完整账户", { exact: true })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "每日工作量" }));
    expect(screen.getByRole("heading", { name: "下载模板" })).toBeVisible();
    expect(screen.queryByLabelText("选择 XLSX 文件")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    expect(screen.getByRole("heading", { name: "上传文件" })).toBeVisible();

    const file = new File(["xlsx"], "template.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    fireEvent.change(screen.getByLabelText("选择 XLSX 文件"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "上传并校验" }));
    expect(await screen.findByRole("heading", { name: "校验预览" })).toBeVisible();
    expect(screen.getByText("VALIDATED", { exact: true })).toBeVisible();
    expect(commitImport).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    expect(screen.getByRole("heading", { name: "确认导入" })).toBeVisible();
    expect(screen.queryByRole("columnheader", { name: "数据" })).not.toBeInTheDocument();
    expect(commitImport).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "确认导入" }));
    await waitFor(() => expect(commitImport).toHaveBeenCalledWith("csrf", validatedJob.id));
    expect(await screen.findByText("导入已完成")).toBeVisible();
  });
});
