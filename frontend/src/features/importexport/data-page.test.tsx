import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Account, AuthResponse } from "@/api/client";
import { DataPage } from "./data-page";

const account = { id: "00000000-0000-0000-0000-000000000001", username: "owner", role: "USER", status: "ACTIVE", timezone: "Asia/Shanghai", created_at: "2026-01-01T00:00:00Z", last_login_at: null } as Account;
const authResponse = { data: { account, accounts: [{ ...account, active: true }], csrf_token: "csrf" }, request_id: "1" } as AuthResponse;

describe("DataPage", () => {
  it("shows the five-step import flow and compact export list", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><DataPage authResponse={authResponse} /></QueryClientProvider>);
    const stepList = screen.getByRole("list", { name: "导入步骤" });
    for (const label of ["选择类型", "下载模板", "上传文件", "校验预览", "确认导入"]) expect(stepList).toHaveTextContent(label);
    expect(screen.getByText("完整账户", { exact: true })).toBeVisible();
    const file = new File(["xlsx"], "template.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    fireEvent.change(screen.getByLabelText("选择 XLSX 文件"), { target: { files: [file] } });
    expect(screen.getByRole("button", { name: "上传并校验" })).toBeEnabled();
  });
});
