import { expect, test } from "@playwright/test";

const superadminUsername = process.env.E2E_SUPERADMIN_USERNAME;
const superadminPassword = process.env.E2E_SUPERADMIN_PASSWORD;

test("enforces browser-level version center permissions", async ({ page }) => {
  test.skip(
    process.env.APP_ENV !== "test" || !superadminUsername || !superadminPassword,
    "run against APP_ENV=test with E2E_SUPERADMIN_USERNAME and E2E_SUPERADMIN_PASSWORD",
  );

  const suffix = Date.now().toString().slice(-10);
  const adminUsername = `versionadmin${suffix}`;
  const adminPassword = "version-admin-password";
  const userUsername = `versionuser${suffix}`;
  const userPassword = "version-user-password";
  const releaseRequests: Array<{ method: string; path: string }> = [];

  await page.route("**/api/admin/system/release**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    releaseRequests.push({ method: request.method(), path });
    if (request.method() !== "GET" || path !== "/api/admin/system/release") {
      await route.abort("blockedbyclient");
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          current_version: "v1.2.3",
          current_commit: "e2e-release-commit",
          build_time: "2026-09-20T03:16:10Z",
          latest_release: {
            version: "v1.2.4",
            name: "JL团队生意成长管理系统 v1.2.4",
            published_at: "2026-09-20T04:00:00Z",
            html_url: "https://example.invalid/releases/v1.2.4",
          },
          update_available: true,
          update_enabled: false,
          installed_versions: [{
            version: "v1.2.3",
            current: true,
            rollback_allowed: false,
            installed_at: "2026-09-20T03:16:10Z",
            rollback_blocked_reason: "当前版本不能回退到自身",
          }],
          update_status: null,
          check_error: null,
        },
        request_id: "e2e-release-request",
      }),
    });
  });

  await login(page, superadminUsername!, superadminPassword!);
  await expect(page.getByRole("heading", { name: "管理员工作台", exact: true })).toBeVisible();

  const superAdminBadge = page.getByTestId("version-badge");
  await expect(superAdminBadge).toBeVisible();
  await expect(superAdminBadge).toHaveAttribute("aria-label", /打开版本中心/);
  await superAdminBadge.click();
  const versionCenter = page.getByRole("dialog");
  await expect(versionCenter.getByRole("heading", { name: "当前版本" })).toBeVisible();
  await expect(versionCenter.getByText("v1.2.3", { exact: true })).toBeVisible();
  await expect(versionCenter.getByText("当前服务器未启用在线更新")).toBeVisible();
  await expect(versionCenter.getByRole("button", { name: /更新到/ })).toHaveCount(0);
  await versionCenter.getByRole("button", { name: "关闭" }).click();
  await expect(versionCenter).toBeHidden();
  expect(releaseRequests).toEqual([{ method: "GET", path: "/api/admin/system/release" }]);

  await page.getByTestId("app-sidebar-content").getByRole("link", { name: "管理员管理" }).click();
  await page.getByLabel("新管理员账号").fill(adminUsername);
  await page.getByLabel("初始密码").fill(adminPassword);
  await page.getByRole("button", { name: "创建管理员" }).click();
  await expect(page.getByRole("status")).toContainText("已创建");

  await page.getByTestId("app-sidebar-content").getByRole("link", { name: "邀请码" }).click();
  await page.getByRole("button", { name: "生成邀请码" }).click();
  const invitationNotice = page.getByRole("status");
  await expect(invitationNotice).toContainText("邀请码已创建：");
  const invitationCode = (await invitationNotice.textContent())?.replace("邀请码已创建：", "").trim();
  expect(invitationCode).toMatch(/^[A-Z0-9]{8,64}$/);

  await logout(page, superadminUsername!);
  releaseRequests.length = 0;
  await login(page, adminUsername, adminPassword);
  await expect(page.getByRole("heading", { name: "管理员工作台", exact: true })).toBeVisible();
  await assertNonInteractiveBadge(page);
  expect(releaseRequests).toEqual([]);

  await logout(page, adminUsername);
  await page.getByRole("link", { name: "首次使用？注册普通用户" }).click();
  await expect(page).toHaveURL(/\/register$/);
  await expect(page.getByRole("heading", { name: "注册普通用户", exact: true })).toBeVisible();
  await page.getByLabel("账号").fill(userUsername);
  await page.getByLabel("密码").fill(userPassword);
  await page.getByLabel("邀请码").fill(invitationCode!);
  await page.getByRole("button", { name: "注册并登录" }).click();
  await expect(page.getByRole("heading", { name: new RegExp(userUsername) })).toBeVisible();
  releaseRequests.length = 0;
  await assertNonInteractiveBadge(page);
  expect(releaseRequests).toEqual([]);
});

async function login(page: import("@playwright/test").Page, username: string, password: string) {
  await page.goto("/");
  await page.getByLabel("账号").fill(username);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录" }).click();
}

async function logout(page: import("@playwright/test").Page, username: string) {
  await page.getByRole("button", { name: new RegExp(`账号菜单 ${username}`) }).click();
  await page.getByRole("menuitem", { name: "退出登录" }).click();
  await expect(page.getByRole("heading", { name: "登录系统", exact: true })).toBeVisible();
}

async function assertNonInteractiveBadge(page: import("@playwright/test").Page) {
  const badge = page.getByTestId("version-badge");
  await expect(badge).toBeVisible();
  await expect(badge).not.toHaveAttribute("aria-label", /打开版本中心/);
  expect(await badge.evaluate((element) => element.tagName)).toBe("SPAN");
  await badge.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
