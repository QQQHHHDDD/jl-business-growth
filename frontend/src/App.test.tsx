import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("App", () => {
  it("shows the system name and a successful API health state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: { status: "ok", checks: {} }, request_id: "request-1" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    renderApp();

    expect(screen.getByRole("heading", { name: "JL团队生意成长管理系统" })).toBeInTheDocument();
    expect(await screen.findByText("API 可用")).toBeInTheDocument();
  });
});
