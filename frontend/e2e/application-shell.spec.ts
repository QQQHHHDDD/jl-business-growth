import { expect, test } from "@playwright/test";

test("loads the application shell", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "JL团队生意成长管理系统" })).toBeVisible();
  await expect(page.getByText("API 可用")).toBeHidden();
});
