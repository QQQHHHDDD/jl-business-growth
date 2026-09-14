import { expect, test } from "@playwright/test";

const superadminUsername = process.env.E2E_SUPERADMIN_USERNAME;
const superadminPassword = process.env.E2E_SUPERADMIN_PASSWORD;

test("covers the Phase 1 administrator flow and Phase 2-3 daily core loop", async ({ page }) => {
  test.skip(process.env.APP_ENV !== "test" || !superadminUsername || !superadminPassword, "run against APP_ENV=test with E2E_SUPERADMIN_USERNAME and E2E_SUPERADMIN_PASSWORD");

  const userPassword = "phase1-user-password";
  const secondUserPassword = "phase1-second-password";
  const firstUsername = `e2e${Date.now().toString().slice(-10)}`;
  const secondUsername = `e2e${(Date.now() + 1).toString().slice(-10)}`;

  await page.goto("/");
  await page.getByLabel("账号").fill(superadminUsername!);
  await page.getByLabel("密码").fill(superadminPassword!);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.getByRole("heading", { name: "管理员工作台" })).toBeVisible();

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
  await page.getByRole("link", { name: "首次使用？注册普通用户" }).click();
  await expect(page).toHaveURL(/\/register$/);
  await expect(page.getByRole("heading", { name: "注册普通用户" })).toBeVisible();
  await page.getByLabel("账号").fill(firstUsername);
  await page.getByLabel("密码").fill(userPassword);
  await page.getByLabel("邀请码").fill(invitationCode!);
  await page.getByRole("button", { name: "注册并登录" }).click();
  await expect(page.getByRole("heading", { name: firstUsername })).toBeVisible();

  await page.goto("/app/worklog");
  await expect(page.getByRole("heading", { name: "今日工作量" })).toBeVisible();
  await page.getByLabel("开启对话").fill("1");
  await page.getByLabel("会面").fill("2");
  await page.getByLabel("读书分钟").fill("30");
  await page.getByLabel("听音频分钟").fill("15");
  await page.getByLabel("营业额 PV（可选）").fill("2");
  await page.getByRole("button", { name: "保存今日记录" }).click();
  await expect(page.getByRole("status")).toContainText("今日工作已保存");

  await page.goto("/app/goals");
  await expect(page.getByRole("heading", { name: "梦想与目标" })).toBeVisible();
  await page.getByLabel("目标名称").fill("本周会面目标");
  await page.getByLabel("指标").selectOption("meeting_count");
  await page.getByLabel("目标值").fill("2");
  await page.getByLabel("单位").fill("次");
  await page.getByRole("button", { name: "创建目标" }).click();
  await expect(page.locator("p").filter({ hasText: "本周会面目标" }).first()).toBeVisible();
  await expect(page.locator("span").filter({ hasText: "100%" }).first()).toBeVisible();
  await page.getByLabel("梦想标题").fill("更有节奏的经营");
  await page.getByRole("button", { name: "保存梦想" }).click();
  await expect(page.getByText("更有节奏的经营")).toBeVisible();

  await page.goto("/app");
  await expect(page.getByText("今日工作量")).toBeVisible();
  await expect(page.getByText("本月 PV")).toBeVisible();

  await page.goto("/app/calendar");
  await expect(page.getByRole("heading", { name: "日历" })).toBeVisible();
  await page.getByRole("button", { name: "新建日程" }).click();
  await page.getByLabel("日程标题").fill("E2E 日历会面");
  const eventStart = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const eventEnd = new Date(eventStart.getTime() + 60 * 60 * 1000);
  const localInput = (value: Date) => { const pad = (part: number) => String(part).padStart(2, "0"); return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`; };
  await page.getByLabel("开始时间").fill(localInput(eventStart));
  await page.getByLabel("结束时间").fill(localInput(eventEnd));
  await page.getByRole("button", { name: "保存日程" }).click();
  await expect(page.getByRole("status")).toContainText("日程已保存");
  await expect(page.getByText("E2E 日历会面").first()).toBeVisible();

  await page.goto("/app/reviews");
  await expect(page.getByRole("heading", { name: "复盘" })).toBeVisible();
  await page.getByLabel("做得好的地方").fill("完成了日历闭环");
  await page.getByLabel("下一周期聚焦").fill("保持每天记录");
  await page.getByRole("button", { name: "保存复盘" }).click();
  await expect(page.getByRole("status")).toContainText("复盘已保存");

  await page.goto("/app/analytics");
  await expect(page.getByRole("heading", { name: "数据统计" })).toBeVisible();
  await expect(page.getByText("聚合结果")).toBeVisible();

  await page.getByRole("button", { name: "退出登录" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "登录系统" })).toBeVisible();
  await page.getByRole("link", { name: "首次使用？注册普通用户" }).click();
  await expect(page).toHaveURL(/\/register$/);
  await expect(page.getByRole("heading", { name: "注册普通用户" })).toBeVisible();
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
