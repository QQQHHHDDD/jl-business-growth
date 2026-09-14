import { expect, test } from "@playwright/test";

const superadminUsername = process.env.E2E_SUPERADMIN_USERNAME;
const superadminPassword = process.env.E2E_SUPERADMIN_PASSWORD;

test("covers the Phase 1 administrator, invitation, registration, and account-switching flow", async ({ page }) => {
  test.skip(process.env.APP_ENV !== "test" || !superadminUsername || !superadminPassword, "run against APP_ENV=test with E2E_SUPERADMIN_USERNAME and E2E_SUPERADMIN_PASSWORD");

  const userPassword = "phase1-user-password";
  const secondUserPassword = "phase1-second-password";
  const firstUsername = `e2e${Date.now().toString().slice(-10)}`;
  const secondUsername = `e2e${(Date.now() + 1).toString().slice(-10)}`;

  await page.goto("/");
  await page.getByLabel("账号").fill(superadminUsername!);
  await page.getByLabel("密码").fill(superadminPassword!);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.getByRole("heading", { name: superadminUsername! })).toBeVisible();

  await page.getByRole("tab", { name: "管理员" }).click();
  await page.getByLabel("新管理员账号").fill(`admin${Date.now().toString().slice(-10)}`);
  await page.getByLabel("初始密码").fill("phase1-admin-password");
  await page.getByRole("button", { name: "创建管理员" }).click();
  await expect(page.getByRole("status")).toContainText("已创建");

  await page.getByRole("tab", { name: "邀请码" }).click();
  await page.getByRole("button", { name: "生成邀请码" }).click();
  const invitationNotice = page.getByRole("status");
  await expect(invitationNotice).toContainText("邀请码已创建：");
  const invitationCode = (await invitationNotice.textContent())?.replace("邀请码已创建：", "").trim();
  expect(invitationCode).toMatch(/^[A-Z0-9]{8,64}$/);

  await page.getByRole("button", { name: "退出登录" }).click();
  await expect(page.getByRole("heading", { name: "登录系统" })).toBeVisible();
  await page.getByRole("button", { name: "首次使用？注册普通用户" }).click();
  await page.getByLabel("账号").fill(firstUsername);
  await page.getByLabel("密码").fill(userPassword);
  await page.getByLabel("邀请码").fill(invitationCode!);
  await page.getByRole("button", { name: "注册并登录" }).click();
  await expect(page.getByRole("heading", { name: firstUsername })).toBeVisible();

  await page.getByRole("button", { name: "退出登录" }).click();
  await page.getByRole("button", { name: "已有账号？返回登录" }).click();
  await page.getByRole("button", { name: "首次使用？注册普通用户" }).click();
  await page.getByLabel("账号").fill(secondUsername);
  await page.getByLabel("密码").fill(secondUserPassword);
  await page.getByLabel("邀请码").fill(invitationCode!);
  await page.getByRole("button", { name: "注册并登录" }).click();
  await expect(page.getByRole("heading", { name: secondUsername })).toBeVisible();

  await page.getByRole("button", { name: "添加账号" }).click();
  await page.getByLabel("账号").last().fill(firstUsername);
  await page.getByLabel("密码", { exact: true }).fill(userPassword);
  await page.getByRole("button", { name: "验证并加入" }).click();
  await expect(page.locator("section").filter({ hasText: "浏览器账号" }).getByText(firstUsername)).toBeVisible();
  await page.getByRole("button", { name: `切换` }).click();
  await expect(page.getByRole("heading", { name: firstUsername })).toBeVisible();

  await expect(page.getByText(secondUsername)).toBeVisible();
});
