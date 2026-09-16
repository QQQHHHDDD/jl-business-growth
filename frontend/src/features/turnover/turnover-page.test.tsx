import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Account, AuthResponse, Turnover } from "@/api/client";
import { listTurnovers, saveTurnover } from "@/api/client";
import { businessDate } from "@/lib/date";
import { TurnoverPage } from "./turnover-page";

vi.mock("@/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/client")>()),
  listTurnovers: vi.fn(),
  saveTurnover: vi.fn(),
}));

const account = { id: "00000000-0000-0000-0000-000000000001", username: "owner", role: "USER", status: "ACTIVE", timezone: "Asia/Shanghai", created_at: "2026-01-01T00:00:00Z", last_login_at: null } as Account;
const authResponse = { data: { account, accounts: [{ ...account, active: true }], csrf_token: "csrf-token" }, request_id: "request-1" } as AuthResponse;

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><TurnoverPage authResponse={authResponse} /></QueryClientProvider>);
}

afterEach(() => vi.clearAllMocks());

describe("TurnoverPage", () => {
  it("synchronizes both fields and preserves the last edited value for an existing record", async () => {
    const date = businessDate(account.timezone);
    const existing = { id: "00000000-0000-0000-0000-000000000010", turnover_date: date, pv: 40, net_amount: "500.00", note: null, created_at: "2026-09-16T00:00:00Z", updated_at: "2026-09-16T00:00:00Z" } as Turnover;
    vi.mocked(listTurnovers).mockResolvedValue({ data: { items: [existing] }, request_id: "request-2" });
    vi.mocked(saveTurnover).mockResolvedValue({ data: existing, request_id: "request-3" });
    renderPage();

    const pvInput = await screen.findByLabelText("PV");
    const netInput = screen.getByLabelText("净营业额（元）");
    await waitFor(() => expect(pvInput).toHaveValue(40));
    expect(netInput).toHaveValue(500);

    fireEvent.change(pvInput, { target: { value: "100" } });
    expect(netInput).toHaveValue(1250);
    fireEvent.change(netInput, { target: { value: "2500.00" } });
    expect(pvInput).toHaveValue(200);

    fireEvent.click(screen.getByRole("button", { name: "保存营业额" }));
    await waitFor(() => expect(saveTurnover).toHaveBeenCalledWith("csrf-token", { turnover_date: date, pv: 200, net_amount: "2500.00", note: null }, true));
  });

  it("clears the paired field when the source field is cleared", async () => {
    vi.mocked(listTurnovers).mockResolvedValue({ data: { items: [] }, request_id: "request-2" });
    renderPage();
    const pvInput = await screen.findByLabelText("PV");
    const netInput = screen.getByLabelText("净营业额（元）");
    fireEvent.change(pvInput, { target: { value: "100" } });
    expect(netInput).toHaveValue(1250);
    fireEvent.change(pvInput, { target: { value: "" } });
    expect(netInput).toHaveValue(null);
  });
});
