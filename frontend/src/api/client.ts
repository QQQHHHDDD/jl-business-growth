import type { components } from "./openapi.gen";

export type HealthResponse = components["schemas"]["HealthResponse"];
export type Account = components["schemas"]["Account"];
export type SessionAccount = components["schemas"]["SessionAccount"];
export type AuthResponse = components["schemas"]["AuthResponse"];
export type AccountsResponse = components["schemas"]["AccountsResponse"];
export type Invitation = components["schemas"]["Invitation"];
export type AccountsListResponse = components["schemas"]["AccountsListResponse"];
export type ErrorResponse = components["schemas"]["ErrorResponse"];
export type AccountResponse = components["schemas"]["AccountResponse"];
export type ResetPasswordResponse = components["schemas"]["ResetPasswordResponse"];
export type DashboardResponse = components["schemas"]["DashboardResponse"];
export type Worklog = components["schemas"]["Worklog"];
export type WorklogRequest = components["schemas"]["WorklogRequest"];
export type Turnover = components["schemas"]["Turnover"];
export type TurnoverRequest = components["schemas"]["TurnoverRequest"];
export type Dream = components["schemas"]["Dream"];
export type DreamRequest = components["schemas"]["DreamRequest"];
export type Goal = components["schemas"]["Goal"];
export type GoalRequest = components["schemas"]["GoalRequest"];
export type CalendarEvent = components["schemas"]["CalendarEvent"];
export type CalendarEventRequest = components["schemas"]["CalendarEventRequest"];
export type Review = components["schemas"]["Review"];
export type ReviewRequest = components["schemas"]["ReviewRequest"];
export type AnalyticsResponse = components["schemas"]["AnalyticsResponse"];
export type TeamMember = components["schemas"]["TeamMember"];
export type TeamMemberRequest = components["schemas"]["TeamMemberRequest"];
export type TeamSnapshot = components["schemas"]["TeamSnapshot"];
export type KnowledgeItem = components["schemas"]["KnowledgeItem"];
export type KnowledgeItemRequest = components["schemas"]["KnowledgeItemRequest"];
export type LearningSession = components["schemas"]["LearningSession"];
export type LearningSessionRequest = components["schemas"]["LearningSessionRequest"];
export type FileAsset = components["schemas"]["FileAsset"];
export type SearchResult = components["schemas"]["SearchResult"];
export type FinanceCategory = components["schemas"]["FinanceCategory"];
export type FinanceCategoryRequest = components["schemas"]["FinanceCategoryRequest"];
export type FinanceTransaction = components["schemas"]["FinanceTransaction"];
export type FinanceTransactionRequest = components["schemas"]["FinanceTransactionRequest"];
export type FinanceBudgetRequest = components["schemas"]["FinanceBudgetRequest"];
export type FinanceSnapshotRequest = components["schemas"]["FinanceSnapshotRequest"];
export type IncomeSimulationInput = components["schemas"]["IncomeSimulationInput"];
export type IncomeSimulationResult = components["schemas"]["IncomeSimulationResult"];
export type IncomeSimulation = components["schemas"]["IncomeSimulation"];
export type IncomeSimulationRequest = components["schemas"]["IncomeSimulationRequest"];
export type ImportJob = components["schemas"]["ImportJob"];
export type ImportType = components["schemas"]["ImportType"];
export type ExportType = components["parameters"]["ExportType"];
export type ExportFormat = components["parameters"]["ExportFormat"];

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

type JSONValue = Record<string, unknown>;

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { headers: requestHeaders, ...requestInit } = init;
  const isMultipart = requestInit.body instanceof FormData;
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      ...(isMultipart ? {} : { "Content-Type": "application/json" }),
      ...requestHeaders,
    },
    ...requestInit,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }
  if (!response.ok) {
    const errorBody = body as ErrorResponse | undefined;
    throw new ApiError(
      response.status,
      errorBody?.error?.code ?? "INTERNAL_ERROR",
      errorBody?.error?.message ?? "请求失败，请稍后重试",
    );
  }
  return body as T;
}

async function requestBlob(path: string): Promise<Blob> {
  const response = await fetch(path, { credentials: "include" });
  if (!response.ok) {
    let body: ErrorResponse | undefined;
    try { body = await response.json(); } catch { /* response may be a proxy error */ }
    throw new ApiError(response.status, body?.error?.code ?? "INTERNAL_ERROR", body?.error?.message ?? "下载失败，请稍后重试");
  }
  return response.blob();
}

function jsonBody(value: JSONValue): RequestInit {
  return { method: "POST", body: JSON.stringify(value) };
}

function withCsrf(csrfToken: string, value?: JSONValue, method = "POST"): RequestInit {
  return {
    method,
    headers: { "X-CSRF-Token": csrfToken },
    ...(value ? { body: JSON.stringify(value) } : {}),
  };
}

export async function getLiveHealth(): Promise<HealthResponse> {
  return request<HealthResponse>("/api/health/live");
}

export async function getMe(): Promise<AuthResponse | null> {
  try {
    return await request<AuthResponse>("/api/auth/me");
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      return null;
    }
    throw error;
  }
}

export function login(username: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/login", jsonBody({ username, password }));
}

export function register(username: string, password: string, invitationCode: string): Promise<AuthResponse> {
  return request<AuthResponse>(
    "/api/auth/register",
    jsonBody({ username, password, invitation_code: invitationCode }),
  );
}

export function logout(csrfToken: string): Promise<void> {
  return request<void>("/api/auth/logout", withCsrf(csrfToken));
}

export function changePassword(csrfToken: string, currentPassword: string, newPassword: string): Promise<void> {
  return request<void>(
    "/api/auth/change-password",
    withCsrf(csrfToken, { current_password: currentPassword, new_password: newPassword }),
  );
}

export function updateTimezone(csrfToken: string, timezone: string): Promise<AccountResponse> {
  return request<AccountResponse>(
    "/api/auth/me/timezone",
    withCsrf(csrfToken, { timezone }, "PATCH"),
  );
}

export function getAccounts(): Promise<AccountsResponse> {
  return request<AccountsResponse>("/api/auth/accounts");
}

export function addAccount(csrfToken: string, username: string, password: string): Promise<AccountsResponse> {
  return request<AccountsResponse>(
    "/api/auth/accounts/add",
    withCsrf(csrfToken, { username, password }),
  );
}

export function switchAccount(csrfToken: string, accountId: string): Promise<AuthResponse> {
  return request<AuthResponse>(
    `/api/auth/accounts/${encodeURIComponent(accountId)}/switch`,
    withCsrf(csrfToken),
  );
}

export function unlinkAccount(csrfToken: string, accountId: string): Promise<void> {
  return request<void>(
    `/api/auth/accounts/${encodeURIComponent(accountId)}`,
    withCsrf(csrfToken, undefined, "DELETE"),
  );
}

export function deleteCurrentAccount(csrfToken: string): Promise<void> {
  return request<void>("/api/auth/account", withCsrf(csrfToken, undefined, "DELETE"));
}

export function listUsers(page = 1, pageSize = 20): Promise<AccountsListResponse> {
  return request<AccountsListResponse>(`/api/admin/users?page=${page}&page_size=${pageSize}`);
}

export function listAdmins(): Promise<AccountsListResponse> {
  return request<AccountsListResponse>("/api/admin/admins");
}

export function setUserStatus(csrfToken: string, accountId: string, status: "ACTIVE" | "DISABLED") {
  return request<AccountResponse>(
    `/api/admin/users/${encodeURIComponent(accountId)}/status`,
    withCsrf(csrfToken, { status }, "PATCH"),
  );
}

export function setAdminStatus(csrfToken: string, accountId: string, status: "ACTIVE" | "DISABLED") {
  return request<AccountResponse>(
    `/api/admin/admins/${encodeURIComponent(accountId)}`,
    withCsrf(csrfToken, { status }, "PATCH"),
  );
}

export function createAdmin(csrfToken: string, username: string, password: string): Promise<AccountResponse> {
  return request<AccountResponse>(
    "/api/admin/admins",
    withCsrf(csrfToken, { username, password }),
  );
}

export function resetUserPassword(csrfToken: string, accountId: string, temporaryPassword?: string): Promise<ResetPasswordResponse> {
  return request<ResetPasswordResponse>(
    `/api/admin/users/${encodeURIComponent(accountId)}/reset-password`,
    withCsrf(csrfToken, temporaryPassword ? { temporary_password: temporaryPassword } : {}),
  );
}

export function resetAdminPassword(csrfToken: string, accountId: string, temporaryPassword?: string): Promise<ResetPasswordResponse> {
  return request<ResetPasswordResponse>(
    `/api/admin/admins/${encodeURIComponent(accountId)}/reset-password`,
    withCsrf(csrfToken, temporaryPassword ? { temporary_password: temporaryPassword } : {}),
  );
}

export function deleteUser(csrfToken: string, accountId: string): Promise<void> {
  return request<void>(
    `/api/admin/users/${encodeURIComponent(accountId)}`,
    withCsrf(csrfToken, undefined, "DELETE"),
  );
}

export function deleteAdmin(csrfToken: string, accountId: string): Promise<void> {
  return request<void>(
    `/api/admin/admins/${encodeURIComponent(accountId)}`,
    withCsrf(csrfToken, undefined, "DELETE"),
  );
}

export function listInvitations(): Promise<{ data: { items: Invitation[] }; request_id: string }> {
  return request("/api/admin/invitation-codes");
}

export function createInvitation(csrfToken: string, code?: string, maxUses?: number, expiresAt?: string): Promise<components["schemas"]["InvitationResponse"]> {
  return request<components["schemas"]["InvitationResponse"]>(
    "/api/admin/invitation-codes",
    withCsrf(csrfToken, { ...(code ? { code } : {}), ...(maxUses !== undefined ? { max_uses: maxUses } : {}), ...(expiresAt ? { expires_at: expiresAt } : {}) }),
  );
}

export function updateInvitation(
  csrfToken: string,
  invitationId: string,
  input: {
    status?: "ACTIVE" | "DISABLED";
    maxUses?: number | null;
    expiresAt?: string | null;
    clearMaxUses?: boolean;
    clearExpiresAt?: boolean;
  },
): Promise<components["schemas"]["InvitationResponse"]> {
  return request<components["schemas"]["InvitationResponse"]>(
    `/api/admin/invitation-codes/${encodeURIComponent(invitationId)}`,
    withCsrf(csrfToken, {
      ...(input.status ? { status: input.status } : {}),
      ...(input.maxUses !== undefined && input.maxUses !== null ? { max_uses: input.maxUses } : {}),
      ...(input.expiresAt !== undefined && input.expiresAt !== null ? { expires_at: input.expiresAt } : {}),
      ...(input.clearMaxUses ? { clear_max_uses: true } : {}),
      ...(input.clearExpiresAt ? { clear_expires_at: true } : {}),
    }, "PATCH"),
  );
}

export function disableInvitation(csrfToken: string, invitationId: string): Promise<void> {
  return request<void>(
    `/api/admin/invitation-codes/${encodeURIComponent(invitationId)}`,
    withCsrf(csrfToken, undefined, "DELETE"),
  );
}

function dateParam(value: string | undefined): string {
  return value ? encodeURIComponent(value) : "";
}

export function getDashboard(date: string): Promise<DashboardResponse> {
  return request<DashboardResponse>(`/api/dashboard?date=${dateParam(date)}`);
}

export function listWorklogs(from?: string, to?: string): Promise<components["schemas"]["WorklogListResponse"]> {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const suffix = params.toString();
  return request(`/api/worklogs${suffix ? `?${suffix}` : ""}`);
}

export function saveWorklog(csrfToken: string, input: WorklogRequest, existing = false): Promise<components["schemas"]["WorklogResponse"]> {
  const path = existing ? `/api/worklogs/${encodeURIComponent(input.work_date)}` : "/api/worklogs";
  return request(path, withCsrf(csrfToken, input, existing ? "PUT" : "POST"));
}

export function deleteWorklog(csrfToken: string, date: string): Promise<void> {
  return request(`/api/worklogs/${encodeURIComponent(date)}`, withCsrf(csrfToken, undefined, "DELETE"));
}

export function listTurnovers(from?: string, to?: string): Promise<components["schemas"]["TurnoverListResponse"]> {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const suffix = params.toString();
  return request(`/api/turnover${suffix ? `?${suffix}` : ""}`);
}

export function saveTurnover(csrfToken: string, input: TurnoverRequest, existing = false): Promise<components["schemas"]["TurnoverResponse"]> {
  const path = existing ? `/api/turnover/${encodeURIComponent(input.turnover_date)}` : "/api/turnover";
  return request(path, withCsrf(csrfToken, input, existing ? "PUT" : "POST"));
}

export function deleteTurnover(csrfToken: string, date: string): Promise<void> {
  return request(`/api/turnover/${encodeURIComponent(date)}`, withCsrf(csrfToken, undefined, "DELETE"));
}

export function listDreams(): Promise<components["schemas"]["DreamListResponse"]> {
  return request("/api/dreams");
}

export function saveDream(csrfToken: string, input: DreamRequest, id?: string): Promise<components["schemas"]["DreamResponse"]> {
  return request(id ? `/api/dreams/${encodeURIComponent(id)}` : "/api/dreams", withCsrf(csrfToken, input, id ? "PUT" : "POST"));
}

export function deleteDream(csrfToken: string, id: string): Promise<void> {
  return request(`/api/dreams/${encodeURIComponent(id)}`, withCsrf(csrfToken, undefined, "DELETE"));
}

export function listGoals(): Promise<components["schemas"]["GoalListResponse"]> {
  return request("/api/goals");
}

export function saveGoal(csrfToken: string, input: GoalRequest, id?: string): Promise<components["schemas"]["GoalResponse"]> {
  return request(id ? `/api/goals/${encodeURIComponent(id)}` : "/api/goals", withCsrf(csrfToken, input, id ? "PUT" : "POST"));
}

export function listCalendarEvents(from: string, to: string): Promise<components["schemas"]["CalendarEventListResponse"]> {
  return request(`/api/calendar/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
}

export function saveCalendarEvent(csrfToken: string, input: CalendarEventRequest, id?: string): Promise<components["schemas"]["CalendarEventResponse"]> {
  return request(id ? `/api/calendar/events/${encodeURIComponent(id)}` : "/api/calendar/events", withCsrf(csrfToken, input, id ? "PUT" : "POST"));
}

export function deleteCalendarEvent(csrfToken: string, id: string): Promise<void> {
  return request(`/api/calendar/events/${encodeURIComponent(id)}`, withCsrf(csrfToken, undefined, "DELETE"));
}

export function getReview(type: "DAILY" | "WEEKLY" | "MONTHLY", periodStart: string): Promise<components["schemas"]["ReviewResponse"]> {
  return request(`/api/reviews/${type}/${encodeURIComponent(periodStart)}`);
}

export function saveReview(csrfToken: string, type: "DAILY" | "WEEKLY" | "MONTHLY", periodStart: string, input: ReviewRequest): Promise<components["schemas"]["ReviewResponse"]> {
  return request(`/api/reviews/${type}/${encodeURIComponent(periodStart)}`, withCsrf(csrfToken, input, "PUT"));
}

export function getAnalytics(metric: "worklogs" | "turnover" | "goals", from: string, to: string, granularity: "day" | "week" | "month"): Promise<AnalyticsResponse> {
  return request(`/api/analytics/${metric}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&granularity=${granularity}`);
}

export function getFinanceAnalytics(from: string, to: string, granularity: "day" | "week" | "month"): Promise<AnalyticsResponse> {
  return request(`/api/analytics/finance?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&granularity=${granularity}`);
}

export function getTeamAnalytics(from: string, to: string, granularity: "day" | "week" | "month"): Promise<AnalyticsResponse> {
  return request(`/api/analytics/team?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&granularity=${granularity}`);
}

export function deleteGoal(csrfToken: string, id: string): Promise<void> {
  return request(`/api/goals/${encodeURIComponent(id)}`, withCsrf(csrfToken, undefined, "DELETE"));
}

export function listTeamMembers(): Promise<components["schemas"]["TeamMemberListResponse"]> { return request("/api/team/members"); }
export function saveTeamMember(csrfToken: string, input: TeamMemberRequest, id?: string): Promise<components["schemas"]["TeamMemberResponse"]> { return request(id ? `/api/team/members/${encodeURIComponent(id)}` : "/api/team/members", withCsrf(csrfToken, input as unknown as JSONValue, id ? "PUT" : "POST")); }
export function deleteTeamMember(csrfToken: string, id: string, promoteChildren = false): Promise<void> { return request(`/api/team/members/${encodeURIComponent(id)}?promote_children=${promoteChildren}`, withCsrf(csrfToken, undefined, "DELETE")); }
export function listTeamSnapshots(): Promise<components["schemas"]["TeamSnapshotListResponse"]> { return request("/api/team/snapshots"); }
export function createTeamSnapshot(csrfToken: string, input: components["schemas"]["TeamSnapshotRequest"]): Promise<components["schemas"]["TeamSnapshotResponse"]> { return request("/api/team/snapshots", withCsrf(csrfToken, input as unknown as JSONValue)); }
export function listKnowledgeItems(): Promise<components["schemas"]["KnowledgeItemListResponse"]> { return request("/api/knowledge"); }
export function saveKnowledgeItem(csrfToken: string, input: KnowledgeItemRequest, id?: string): Promise<components["schemas"]["KnowledgeItemResponse"]> { return request(id ? `/api/knowledge/${encodeURIComponent(id)}` : "/api/knowledge", withCsrf(csrfToken, input as unknown as JSONValue, id ? "PUT" : "POST")); }
export function deleteKnowledgeItem(csrfToken: string, id: string): Promise<void> { return request(`/api/knowledge/${encodeURIComponent(id)}`, withCsrf(csrfToken, undefined, "DELETE")); }
export function listLearningSessions(from?: string, to?: string): Promise<components["schemas"]["LearningSessionListResponse"]> { const params = new URLSearchParams(); if (from) params.set("from", from); if (to) params.set("to", to); return request(`/api/learning-sessions${params.toString() ? `?${params}` : ""}`); }
export function saveLearningSession(csrfToken: string, input: LearningSessionRequest): Promise<components["schemas"]["LearningSessionResponse"]> { return request("/api/learning-sessions", withCsrf(csrfToken, input as unknown as JSONValue)); }
export function listFiles(): Promise<components["schemas"]["FileListResponse"]> { return request("/api/files"); }
export function uploadFile(csrfToken: string, file: File, category: "DREAM_IMAGE" | "KNOWLEDGE_DOCUMENT" | "KNOWLEDGE_IMAGE"): Promise<components["schemas"]["FileResponse"]> { const form = new FormData(); form.set("category", category); form.set("file", file); return request("/api/files", { method: "POST", headers: { "X-CSRF-Token": csrfToken }, body: form }); }
export function deleteFile(csrfToken: string, id: string): Promise<void> { return request(`/api/files/${encodeURIComponent(id)}`, withCsrf(csrfToken, undefined, "DELETE")); }
export function searchRecords(query: string, modules: string[] = [], page = 1, pageSize = 20): Promise<components["schemas"]["SearchResponse"]> { const params = new URLSearchParams({ q: query, page: String(page), page_size: String(pageSize) }); if (modules.length) params.set("modules", modules.join(",")); return request(`/api/search?${params}`); }

export function downloadImportTemplate(type: ImportType): Promise<Blob> { return requestBlob(`/api/imports/templates/${encodeURIComponent(type)}`); }
export function createImport(csrfToken: string, type: ImportType, file: File): Promise<components["schemas"]["ImportJobResponse"]> {
  const form = new FormData();
  form.set("type", type);
  form.set("file", file);
  return request("/api/imports", { method: "POST", headers: { "X-CSRF-Token": csrfToken }, body: form });
}
export function getImport(id: string): Promise<components["schemas"]["ImportJobResponse"]> { return request(`/api/imports/${encodeURIComponent(id)}`); }
export function validateImport(csrfToken: string, id: string): Promise<components["schemas"]["ImportJobResponse"]> { return request(`/api/imports/${encodeURIComponent(id)}/validate`, withCsrf(csrfToken)); }
export function commitImport(csrfToken: string, id: string): Promise<components["schemas"]["ImportJobResponse"]> { return request(`/api/imports/${encodeURIComponent(id)}/commit`, withCsrf(csrfToken)); }
export function deleteImport(csrfToken: string, id: string): Promise<void> { return request(`/api/imports/${encodeURIComponent(id)}`, withCsrf(csrfToken, undefined, "DELETE")); }
export function exportData(type: ExportType, format: ExportFormat): Promise<Blob> { return requestBlob(`/api/exports/${encodeURIComponent(type)}?format=${encodeURIComponent(format)}`); }

export function listFinanceCategories(): Promise<components["schemas"]["FinanceCategoryListResponse"]> { return request("/api/finance/categories"); }
export function createFinanceCategory(csrfToken: string, input: FinanceCategoryRequest): Promise<components["schemas"]["FinanceCategoryResponse"]> { return request("/api/finance/categories", withCsrf(csrfToken, input as unknown as JSONValue)); }
export function archiveFinanceCategory(csrfToken: string, id: string): Promise<void> { return request(`/api/finance/categories/${encodeURIComponent(id)}`, withCsrf(csrfToken, undefined, "DELETE")); }
export function listFinanceTransactions(from?: string, to?: string): Promise<components["schemas"]["FinanceTransactionListResponse"]> { const params = new URLSearchParams(); if (from) params.set("from", from); if (to) params.set("to", to); return request(`/api/finance/transactions${params.toString() ? `?${params}` : ""}`); }
export function saveFinanceTransaction(csrfToken: string, input: FinanceTransactionRequest, id?: string): Promise<components["schemas"]["FinanceTransactionResponse"]> { return request(id ? `/api/finance/transactions/${encodeURIComponent(id)}` : "/api/finance/transactions", withCsrf(csrfToken, input as unknown as JSONValue, id ? "PUT" : "POST")); }
export function deleteFinanceTransaction(csrfToken: string, id: string): Promise<void> { return request(`/api/finance/transactions/${encodeURIComponent(id)}`, withCsrf(csrfToken, undefined, "DELETE")); }
export function listFinanceBudgets(): Promise<components["schemas"]["FinanceBudgetListResponse"]> { return request("/api/finance/budgets"); }
export function saveFinanceBudget(csrfToken: string, input: FinanceBudgetRequest): Promise<components["schemas"]["FinanceBudgetResponse"]> { return request("/api/finance/budgets", withCsrf(csrfToken, input as unknown as JSONValue)); }
export function listFinanceSnapshots(): Promise<components["schemas"]["FinanceSnapshotListResponse"]> { return request("/api/finance/snapshots"); }
export function saveFinanceSnapshot(csrfToken: string, input: FinanceSnapshotRequest): Promise<components["schemas"]["FinanceSnapshotResponse"]> { return request("/api/finance/snapshots", withCsrf(csrfToken, input as unknown as JSONValue)); }
export function calculateIncome(input: IncomeSimulationInput): Promise<components["schemas"]["IncomeCalculationResponse"]> { return request("/api/income-simulator/calculate", jsonBody(input as unknown as JSONValue)); }
export function listIncomeSimulations(): Promise<components["schemas"]["IncomeSimulationListResponse"]> { return request("/api/income-simulations"); }
export function saveIncomeSimulation(csrfToken: string, input: IncomeSimulationRequest, id?: string): Promise<components["schemas"]["IncomeSimulationResponse"]> { return request(id ? `/api/income-simulations/${encodeURIComponent(id)}` : "/api/income-simulations", withCsrf(csrfToken, input as unknown as JSONValue, id ? "PUT" : "POST")); }
export function duplicateIncomeSimulation(csrfToken: string, id: string): Promise<components["schemas"]["IncomeSimulationResponse"]> { return request(`/api/income-simulations/${encodeURIComponent(id)}/duplicate`, withCsrf(csrfToken)); }
export function deleteIncomeSimulation(csrfToken: string, id: string): Promise<void> { return request(`/api/income-simulations/${encodeURIComponent(id)}`, withCsrf(csrfToken, undefined, "DELETE")); }
export function compareIncomeSimulations(ids: string[]): Promise<components["schemas"]["IncomeSimulationListResponse"]> { return request("/api/income-simulations/compare", jsonBody({ ids })); }
