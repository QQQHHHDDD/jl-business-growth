import { expect, test } from "@playwright/test";
import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";

const superadminUsername = process.env.E2E_SUPERADMIN_USERNAME;
const superadminPassword = process.env.E2E_SUPERADMIN_PASSWORD;

test("covers the Phase 1 administrator flow and Phase 2-6 core loops", async ({
  page,
}) => {
  test.skip(
    process.env.APP_ENV !== "test" ||
      !superadminUsername ||
      !superadminPassword,
    "run against APP_ENV=test with E2E_SUPERADMIN_USERNAME and E2E_SUPERADMIN_PASSWORD",
  );

  const userPassword = "phase1-user-password";
  const secondUserPassword = "phase1-second-password";
  const firstUsername = `e2e${Date.now().toString().slice(-10)}`;
  const secondUsername = `e2e${(Date.now() + 1).toString().slice(-10)}`;

  await page.goto("/");
  await page.getByLabel("账号").fill(superadminUsername!);
  await page.getByLabel("密码").fill(superadminPassword!);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(
    page.getByRole("heading", { name: "管理员工作台", exact: true }),
  ).toBeVisible();

  await page.getByRole("tab", { name: "管理员" }).click();
  await page
    .getByLabel("新管理员账号")
    .fill(`admin${Date.now().toString().slice(-10)}`);
  await page.getByLabel("初始密码").fill("phase1-admin-password");
  await page.getByRole("button", { name: "创建管理员" }).click();
  await expect(page.getByRole("status")).toContainText("已创建");

  await page.getByRole("tab", { name: "邀请码" }).click();
  await page.getByRole("button", { name: "生成邀请码" }).click();
  const invitationNotice = page.getByRole("status");
  await expect(invitationNotice).toContainText("邀请码已创建：");
  const invitationCode = (await invitationNotice.textContent())
    ?.replace("邀请码已创建：", "")
    .trim();
  expect(invitationCode).toMatch(/^[A-Z0-9]{8,64}$/);

  await page
    .getByRole("button", { name: new RegExp(`账号菜单 ${superadminUsername}`) })
    .click();
  await page.getByRole("menuitem", { name: "退出登录" }).click();
  await expect(
    page.getByRole("heading", { name: "登录系统", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "首次使用？注册普通用户" }).click();
  await expect(page).toHaveURL(/\/register$/);
  await expect(
    page.getByRole("heading", { name: "注册普通用户", exact: true }),
  ).toBeVisible();
  await page.getByLabel("账号").fill(firstUsername);
  await page.getByLabel("密码").fill(userPassword);
  await page.getByLabel("邀请码").fill(invitationCode!);
  await page.getByRole("button", { name: "注册并登录" }).click();
  await expect(
    page.getByRole("heading", { name: new RegExp(firstUsername) }),
  ).toBeVisible();

  let releaseTeamRequest: (() => void) | undefined;
  const teamRequestGate = new Promise<void>((resolve) => {
    releaseTeamRequest = resolve;
  });
  await page.route(
    "**/api/team/members",
    async (route) => {
      await teamRequestGate;
      await route.continue();
    },
    { times: 1 },
  );
  await page.goto("/app/team");
  await expect(page.getByRole("heading", { name: "团队", exact: true })).toBeVisible();
  await expect(page.getByText("还没有团队成员")).toHaveCount(0);
  releaseTeamRequest?.();
  await expect(page.getByText("还没有团队成员")).toBeVisible();

  await page.goto("/app/worklog");
  await expect(
    page.getByRole("heading", { name: "今日工作量", exact: true }),
  ).toBeVisible();
  await page.getByRole("spinbutton", { name: "开启对话", exact: true }).fill("1");
  await page.getByRole("spinbutton", { name: "会面", exact: true }).fill("2");
  await page.getByLabel("读书分钟").fill("30");
  await page.getByLabel("听音频分钟").fill("15");
  await page.getByLabel("营业额 PV（可选）").fill("2");
  await page.getByRole("button", { name: "保存今日记录" }).click();
  await expect(page.getByRole("status")).toContainText("今日工作已保存");

  await page.goto("/app/goals");
  await expect(
    page.getByRole("heading", { name: "梦想与目标", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "新建目标" }).first().click();
  await page.getByLabel("目标名称").fill("本周会面目标");
  await page.getByLabel("指标").selectOption("meeting_count");
  await page.getByLabel("目标值").fill("2");
  await page.getByLabel("单位").fill("次");
  await page.getByRole("button", { name: "创建目标" }).click();
  await expect(page.getByRole("status")).toContainText("目标已创建");
  await page.getByRole("tab", { name: "目标列表" }).click();
  await expect(page.getByText("本周会面目标", { exact: true }).first()).toBeVisible();
  await page.getByRole("tab", { name: "梦想板" }).click();
  await page.getByRole("button", { name: "新增梦想" }).first().click();
  const dreamDialog = page.getByRole("dialog");
  await expect(dreamDialog).toBeVisible();
  const dreamDialogBox = await dreamDialog.boundingBox();
  const dreamViewport = page.viewportSize();
  expect(dreamDialogBox).not.toBeNull();
  expect(dreamViewport).not.toBeNull();
  expect(
    Math.abs(
      dreamDialogBox!.x + dreamDialogBox!.width / 2 - dreamViewport!.width / 2,
    ),
  ).toBeLessThanOrEqual(16);
  const onePixelPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nAAAAABJRU5ErkJggg==",
    "base64",
  );
  await page.getByLabel("选择梦想图片").setInputFiles([
    { name: "dream-cover.png", mimeType: "image/png", buffer: onePixelPng },
    { name: "dream-detail.png", mimeType: "image/png", buffer: onePixelPng },
  ]);
  await expect(dreamDialog.getByText("2 / 10", { exact: true })).toBeVisible();
  await page.getByLabel("梦想标题").fill("更有节奏的经营");
  await page.getByRole("button", { name: "保存梦想" }).click();
  await expect(page.getByRole("status")).toContainText("梦想已保存");
  await expect(page.getByRole("heading", { name: "更有节奏的经营" })).toBeVisible();

  await page.goto("/app");
  await expect(
    page.getByRole("heading", { name: "经营进度", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("本月 PV", { exact: true })).toBeVisible();

  await page.goto("/app/calendar");
  await expect(
    page.getByRole("heading", { name: "日历", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "新建日程" }).click();
  await page.getByLabel("日程标题").fill("E2E 日历会面");
  const eventStart = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const eventEnd = new Date(eventStart.getTime() + 60 * 60 * 1000);
  const localInput = (value: Date) => {
    const pad = (part: number) => String(part).padStart(2, "0");
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
  };
  await page.getByLabel("开始时间").fill(localInput(eventStart));
  await page.getByLabel("结束时间").fill(localInput(eventEnd));
  await page.getByRole("button", { name: "保存日程" }).click();
  await expect(page.getByRole("status")).toContainText("日程已保存");
  await expect(page.getByText("E2E 日历会面").first()).toBeVisible();

  const contactsResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).pathname === "/api/calendar/contacts",
  );
  await page.reload();
  expect((await contactsResponse).status()).toBe(200);
  await page.getByRole("tab", { name: "常用联系人" }).click();
  await expect(page.getByText("还没有常用联系人")).toBeVisible();
  await page.getByRole("button", { name: "新增联系人" }).click();
  await page.getByLabel("姓名（可选）").fill("E2E 联系人");
  await page.getByLabel("邮箱", { exact: true }).fill("e2e-contact@example.test");
  await page.getByRole("button", { name: "保存联系人" }).click();
  await expect(page.getByRole("status")).toContainText("常用联系人已保存");
  await expect(page.getByText("e2e-contact@example.test")).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: "常用联系人" }).click();
  await expect(page.getByText("e2e-contact@example.test")).toBeVisible();

  await page.goto("/app/reviews");
  await expect(
    page.getByRole("heading", { name: "复盘", exact: true }),
  ).toBeVisible();
  await page.getByLabel("做得好的地方").fill("完成了日历闭环");
  await page.getByLabel("明日重点").fill("保持每天记录");
  await page.getByRole("button", { name: "保存复盘" }).click();
  await expect(page.getByRole("status")).toContainText("复盘已保存");

  await page.goto("/app/analytics");
  await expect(
    page.getByRole("heading", { name: "数据统计", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "工作量趋势", exact: true }),
  ).toBeVisible();
  const analyticsToolbar = page.getByTestId("analytics-range-toolbar");
  const analyticsResults = page.getByRole("heading", {
    name: "工作量趋势",
    exact: true,
  });
  await page.getByRole("button", { name: "财年", exact: true }).click();
  const fiscalToolbarBox = await analyticsToolbar.boundingBox();
  const fiscalResultsBox = await analyticsResults.boundingBox();
  await page.getByRole("button", { name: "自定义", exact: true }).click();
  const customToolbarBox = await analyticsToolbar.boundingBox();
  const customResultsBox = await analyticsResults.boundingBox();
  expect(customToolbarBox?.height).toBe(fiscalToolbarBox?.height);
  expect(customResultsBox?.y).toBe(fiscalResultsBox?.y);

  await page.goto("/app/team");
  await expect(
    page.getByRole("heading", { name: "团队", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "新增成员" }).click();
  await page.getByLabel("团队成员姓名").fill("E2E 团队成员");
  await page.getByLabel("自定义节点颜色").fill("#2563eb");
  await page.getByRole("button", { name: "保存成员" }).click();
  await expect(page.getByRole("status")).toContainText("团队成员已保存");
  const teamNode = page.locator(".react-flow__node").filter({ hasText: "E2E 团队成员" });
  await expect(teamNode).toHaveCSS("background-color", "rgb(37, 99, 235)");
  await expect(page.locator(".team-graph .react-flow__handle").first()).toHaveCSS("opacity", "0");
  await page.reload();
  await expect(page.locator(".react-flow__node").filter({ hasText: "E2E 团队成员" })).toHaveCSS("background-color", "rgb(37, 99, 235)");

  await page.goto("/app/knowledge");
  await expect(
    page.getByRole("heading", { name: "学习中心", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "新增学习" }).first().click();
  await page.getByLabel("学习项目标题").fill("E2E 学习项目");
  await page.getByRole("button", { name: "保存项目" }).click();
  await expect(page.getByRole("status")).toContainText("学习项目已保存");

  await page.goto("/app/search");
  await expect(
    page.getByRole("heading", { name: "全局搜索", exact: true }),
  ).toBeVisible();
  await page.getByLabel("搜索关键词").fill("E2E 学习项目");
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  await expect(
    page.getByText("E2E 学习项目", { exact: true }).first(),
  ).toBeVisible();

  await page.goto("/app/finance");
  await expect(
    page.getByRole("heading", { name: "财务", exact: true }),
  ).toBeVisible();
  const e2eCategory = `E2E支出${Date.now().toString().slice(-6)}`;
  const categoryDisclosure = page.locator("summary").filter({ hasText: "管理收支分类" });
  await categoryDisclosure.focus();
  await categoryDisclosure.press("Enter");
  await page.getByLabel("分类名称").fill(e2eCategory);
  await page.getByRole("button", { name: "新增分类" }).click();
  await expect(page.getByRole("status")).toContainText("财务分类已创建");
  await page.getByRole("button", { name: "新增流水" }).first().click();
  const transactionSheet = page.getByRole("dialog");
  await transactionSheet
    .getByRole("combobox", { name: "分类" })
    .selectOption({ label: e2eCategory });
  await transactionSheet
    .getByRole("spinbutton", { name: "金额" })
    .fill("123.45");
  await transactionSheet.getByRole("button", { name: "保存流水" }).click();
  await expect(page.getByRole("status")).toContainText("财务流水已保存");

  await page.goto("/app/income-simulator");
  await expect(
    page.getByRole("heading", { name: "收入模拟", exact: true }),
  ).toBeVisible();
  await page.getByLabel("个人使用 PV").fill("1000");
  await page.getByRole("button", { name: "计算收入" }).click();
  await expect(page.getByText("¥1125.00")).toBeVisible();
  await page.getByTestId("income-results").getByRole("button", { name: "保存方案" }).click();
  await expect(page.getByRole("status")).toContainText("收入模拟方案已保存");

  await page.goto("/app/data");
  await expect(
    page.getByRole("heading", { name: "导入 / 导出", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "每日工作量" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /下载.*模板/ }).click();
  const templateDownload = await downloadPromise;
  const templatePath = await templateDownload.path();
  expect(templatePath).toBeTruthy();
  await page.getByRole("button", { name: "下一步" }).click();
  await page.getByLabel("选择 XLSX 文件").setInputFiles({
    name: "phase6-worklog.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: readFileSync(templatePath!),
  });
  await page.getByRole("button", { name: "上传并校验" }).click();
  await expect(page.getByText("VALIDATED", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "下一步" }).click();
  await page.getByRole("button", { name: "确认导入", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("数据已导入");

  for (const width of [1440, 1280, 1024]) {
    await page.setViewportSize({ width, height: 760 });
    await page.goto("/app");
    const brand = page.getByText("JL团队生意成长管理系统", { exact: true });
    await expect(brand).toBeVisible();
    expect(await brand.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  }

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/app");
  for (const testID of ["dashboard-today-scroll", "dashboard-goals-scroll"]) {
    const region = page.getByTestId(testID);
    await expect(region).toBeVisible();
    expect(await region.evaluate((element) => getComputedStyle(element).height)).toBe("216px");
    expect(await region.evaluate((element) => getComputedStyle(element).overflowY)).toBe("auto");
  }

  await page.goto("/app/goals");
  const pageContainer = page.getByTestId("page-container");
  for (const tab of ["目标列表", "梦想板", "目标地图"]) {
    await page.getByRole("tab", { name: tab }).click();
    await expect(pageContainer).toHaveCSS("max-width", "1360px");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      ),
    ).toBe(true);
  }

  await page.goto("/app/calendar");
  const todayNumber = page.locator(".fc-day-today .fc-daygrid-day-number").first();
  await expect(todayNumber).toBeVisible();
  const todayNumberBox = await todayNumber.boundingBox();
  const todayEvents = page.locator(".fc-day-today .fc-daygrid-day-events").first();
  const todayEventsBox = await todayEvents.boundingBox();
  if (todayNumberBox && todayEventsBox) expect(todayNumberBox.y + todayNumberBox.height).toBeLessThanOrEqual(todayEventsBox.y + 1);

  await page.goto("/app/team");
  await page.evaluate(() => window.scrollTo(0, 360));
  const graphScrollPosition = await page.evaluate(() => window.scrollY);
  await page.getByRole("tab", { name: "成员列表" }).click();
  await page.getByRole("tab", { name: "关系图" }).click();
  expect(Math.abs((await page.evaluate(() => window.scrollY)) - graphScrollPosition)).toBeLessThanOrEqual(2);

  const responsiveRoutes = [
    ["/app/finance", "财务"],
    ["/app/knowledge", "学习中心"],
    ["/app/income-simulator", "收入模拟"],
    ["/app/reviews", "复盘"],
    ["/app/analytics", "数据统计"],
    ["/app/data", "导入 / 导出"],
    ["/app/settings", "设置"],
  ] as const;
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: width >= 1024 ? 900 : 844 });
    for (const [path, heading] of responsiveRoutes) {
      await page.goto(path);
      await expect(
        page.getByRole("heading", { name: heading, exact: true }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth + 1,
        ),
      ).toBe(true);
    }
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/finance");
  await page.getByRole("button", { name: "新增流水" }).first().click();
  const financeSheet = await page.getByRole("dialog").boundingBox();
  expect(financeSheet?.width).toBeLessThanOrEqual(390);
  await page.getByRole("button", { name: "关闭" }).click();

  await page
    .getByRole("button", { name: new RegExp(`账号菜单 ${firstUsername}`) })
    .click();
  await page.getByRole("menuitem", { name: "退出登录" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("heading", { name: "登录系统", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "首次使用？注册普通用户" }).click();
  await expect(page).toHaveURL(/\/register$/);
  await expect(
    page.getByRole("heading", { name: "注册普通用户", exact: true }),
  ).toBeVisible();
  await page.getByLabel("账号").fill(secondUsername);
  await page.getByLabel("密码").fill(secondUserPassword);
  await page.getByLabel("邀请码").fill(invitationCode!);
  await page.getByRole("button", { name: "注册并登录" }).click();
  await expect(
    page.getByRole("heading", { name: new RegExp(secondUsername) }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: new RegExp(`账号菜单 ${secondUsername}`) })
    .click();
  await page.getByRole("menuitem", { name: "添加账号" }).click();
  await page.getByLabel("账号").last().fill(firstUsername);
  await page.getByLabel("密码", { exact: true }).fill(userPassword);
  await page.getByRole("button", { name: "验证并加入" }).click();
  await expect(
    page.getByRole("heading", { name: new RegExp(firstUsername) }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: new RegExp(`账号菜单 ${firstUsername}`) })
    .click();
  await expect(
    page.getByRole("menuitem", { name: secondUsername }),
  ).toBeVisible();
});
