import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./button";
import { ConfirmDialog, PromptDialog } from "./dialog";
import { Input } from "./input";
import { EmptyState, ErrorState, LoadingState } from "./state-block";
import { StatusBadge } from "./badge";
import { DataTable, TableBody, TableCell, TableHead, TableRow } from "./table";

describe("shared UI primitives", () => {
  it("exposes loading and disabled state on Button and validation state on Input", () => {
    render(
      <>
        <Button loading>保存</Button>
        <Input label="账号" description="用于登录" error="账号不能为空" required />
      </>,
    );

    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
    expect(screen.getByLabelText("账号")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("账号")).toHaveAttribute("aria-describedby");
    expect(screen.getByText("账号不能为空")).toBeInTheDocument();
  });

  it("keeps labels associated with distinct inputs even when field names repeat", () => {
    render(
      <>
        <Input name="title" label="目标名称" />
        <Input name="title" label="梦想标题" />
      </>,
    );

    const goalInput = screen.getByLabelText("目标名称");
    const dreamInput = screen.getByLabelText("梦想标题");
    expect(goalInput).not.toHaveAttribute("id", dreamInput.getAttribute("id"));
  });

  it("renders status, empty, loading, error and retry states accessibly", () => {
    const retry = vi.fn();
    render(
      <>
        <StatusBadge tone="success">已启用</StatusBadge>
        <LoadingState label="正在加载用户" />
        <EmptyState title="暂无用户" description="创建后会显示在这里。" />
        <ErrorState message="加载失败" onRetry={retry} />
      </>,
    );

    expect(screen.getByText("已启用")).toBeInTheDocument();
    expect(screen.getByText("正在加载用户...")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "暂无用户" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("keeps tables readable with a minimum width and semantic column headers", () => {
    render(
      <DataTable>
        <TableHead><TableRow><TableCell asHeader>账号</TableCell><TableCell asHeader>状态</TableCell></TableRow></TableHead>
        <TableBody><TableRow><TableCell>owner</TableCell><TableCell>启用</TableCell></TableRow></TableBody>
      </DataTable>,
    );

    expect(screen.getByRole("columnheader", { name: "账号" })).toHaveAttribute("scope", "col");
    expect(screen.getByRole("table")).toHaveClass("min-w-[760px]");
    expect(screen.getByRole("table").parentElement).toHaveClass("overflow-x-auto");
  });

  it("supports confirm and prompt dialog cancel, confirm and loading states", () => {
    const onConfirm = vi.fn();
    const onPromptConfirm = vi.fn();
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <ConfirmDialog open onOpenChange={onOpenChange} title="删除账号" description="此操作无法撤销。" onConfirm={onConfirm} />,
    );

    expect(screen.getByRole("dialog", { name: "删除账号" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByRole("button", { name: "确认" }));
    expect(onConfirm).toHaveBeenCalledOnce();

    rerender(<PromptDialog open onOpenChange={onOpenChange} title="设置临时密码" description="请输入一次性密码。" label="临时密码" value="" onValueChange={() => undefined} onConfirm={onPromptConfirm} loading />);
    expect(screen.getByRole("button", { name: "确认" })).toBeDisabled();
    expect(screen.getByLabelText("临时密码")).toBeInTheDocument();
  });
});
