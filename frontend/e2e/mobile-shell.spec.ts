import { expect, test } from "@playwright/test";

const superadminUsername = process.env.E2E_SUPERADMIN_USERNAME;
const superadminPassword = process.env.E2E_SUPERADMIN_PASSWORD;

test("supports the mobile administrator shell", async ({ page }) => {
  test.skip(process.env.APP_ENV !== "test" || !superadminUsername || !superadminPassword, "run against APP_ENV=test with E2E_SUPERADMIN_USERNAME and E2E_SUPERADMIN_PASSWORD");

  await page.goto("/");
  await page.getByLabel("账号").fill(superadminUsername!);
  await page.getByLabel("密码").fill(superadminPassword!);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.getByRole("heading", { name: "管理员工作台" })).toBeVisible();

  const quickNavigation = page.getByRole("navigation", { name: "快捷导航" });
  await expect(quickNavigation.getByRole("link", { name: "管理首页" })).toBeVisible();
  await expect(quickNavigation.getByRole("link", { name: "用户管理" })).toBeVisible();
  await expect(quickNavigation.getByRole("link", { name: "邀请码" })).toBeVisible();
  await expect(quickNavigation.getByRole("link", { name: "管理员管理" })).toBeVisible();
  await expect(quickNavigation.getByRole("link", { name: "设置" })).toBeVisible();

  await quickNavigation.getByRole("link", { name: "用户管理" }).click();
  await expect(page.getByRole("heading", { name: "用户管理", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);

  const pageContainer = page.locator("main > div");
  expect(await pageContainer.evaluate((element) => Number.parseFloat(getComputedStyle(element).paddingBottom))).toBeGreaterThanOrEqual(112);

  await page.getByRole("button", { name: "打开导航" }).click();
  await expect(page.getByRole("dialog", { name: "应用导航" })).toBeVisible();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "应用导航" })).toBeHidden();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");

  await page.getByRole("button", { name: "打开导航" }).click();
  const viewport = page.viewportSize();
  await page.locator('[data-testid="navigation-overlay"]').click({ position: { x: (viewport?.width ?? 412) - 8, y: 8 } });
  await expect(page.getByRole("dialog", { name: "应用导航" })).toBeHidden();

  await page.getByRole("button", { name: "打开导航" }).click();
  await page.getByRole("button", { name: "关闭导航" }).click();
  await expect(page.getByRole("dialog", { name: "应用导航" })).toBeHidden();
});
