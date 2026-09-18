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
  const currentCalendarTitle = `E2E 当前日历会面 ${Date.now()}`;
  const fixedCalendarTitle = `E2E 15:30 至 22:00 ${Date.now()}`;
  const nextCalendarTitle = `E2E 日历会面 ${Date.now()}`;
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("Failed to load resource")) {
      browserErrors.push(`[console:${message.type()}] ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => browserErrors.push(`[pageerror] ${error.stack ?? error.message}`));

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

  test.setTimeout(120_000);
  const coldSidebar = page.getByTestId("app-sidebar");
  const coldTopbar = page.getByTestId("app-topbar");
  const coldContainer = page.getByTestId("page-container");
  const coldSidebarHandle = await coldSidebar.elementHandle();
  const coldTopbarHandle = await coldTopbar.elementHandle();
  const coldContainerHandle = await coldContainer.elementHandle();
  const coldRoutes = [
    ["/app", "经营进度"], ["/app/worklog", "今日工作量"], ["/app/calendar", "日历"],
    ["/app/goals", "梦想与目标"], ["/app/team", "团队"], ["/app/finance", "财务"],
    ["/app/knowledge", "学习中心"], ["/app/reviews", "复盘"], ["/app/analytics", "数据统计"],
    ["/app/data", "导入 / 导出"], ["/app/settings", "设置"], ["/app", "经营进度"],
  ] as const;
  const coldGroups: Record<string, string> = {
    "/app/worklog": "规划与执行", "/app/calendar": "规划与执行", "/app/goals": "规划与执行",
    "/app/team": "经营管理", "/app/finance": "经营管理", "/app/knowledge": "成长与复盘",
    "/app/reviews": "成长与复盘", "/app/analytics": "成长与复盘", "/app/data": "系统工具", "/app/settings": "系统工具",
  };
  const lazyChunks: Record<string, string> = {
    "/app/calendar": "calendar-page", "/app/goals": "goals-page", "/app/team": "team-page",
  };
  const routeDiagnostics: Array<Record<string, unknown>> = [];
  for (let round = 0; round < 5; round += 1) {
    for (const [path, heading] of coldRoutes) {
      const routeLink = coldSidebar.locator(`a[href="${path}"]`).first();
      if (await routeLink.count() === 0) await coldSidebar.getByRole("button", { name: coldGroups[path], exact: true }).click();
      await routeLink.hover();
      const chunk = lazyChunks[path];
      if (chunk) await expect.poll(() => page.evaluate((needle) => performance.getEntriesByType("resource").some((entry) => entry.name.includes(needle)), chunk)).toBe(true);
      const framesPromise = page.evaluate(() => new Promise<Array<{ childCount: number; header: boolean; height: number; width: number; headerTop: number; scrollWidth: number; clientWidth: number; scrollY: number }>>((resolve) => {
        const samples: Array<{ childCount: number; header: boolean; height: number; width: number; headerTop: number; scrollWidth: number; clientWidth: number; scrollY: number }> = [];
        const sample = () => {
          const container = document.querySelector<HTMLElement>('[data-testid="page-container"]');
          const header = container?.querySelector<HTMLElement>("h1");
          const rect = container?.getBoundingClientRect();
          const headerRect = header?.getBoundingClientRect();
          samples.push({ childCount: container?.childElementCount ?? 0, header: Boolean(header), height: rect?.height ?? 0, width: rect?.width ?? 0, headerTop: headerRect?.top ?? 0, scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, scrollY: window.scrollY });
          if (samples.length >= 12) resolve(samples); else requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      }));
      const resourceCount = await page.evaluate(() => performance.getEntriesByType("resource").length);
      await routeLink.click();
      await expect(page).toHaveURL(new RegExp(`${path.replaceAll("/", "\\/")}\\/?$`));
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
      const frames = await framesPromise;
      expect(frames.every((frame) => frame.childCount > 0 && frame.header && frame.height >= 400 && frame.width > 0 && frame.scrollWidth <= frame.clientWidth + 1)).toBe(true);
      expect(Math.min(...frames.map((frame) => frame.height))).toBeGreaterThanOrEqual(400);
      expect(Math.max(...frames.map((frame) => frame.height)) / Math.max(1, Math.min(...frames.map((frame) => frame.height)))).toBeLessThan(5);
      expect(await coldSidebar.evaluate((element, previous) => element === previous, coldSidebarHandle)).toBe(true);
      expect(await coldTopbar.evaluate((element, previous) => element === previous, coldTopbarHandle)).toBe(true);
      expect(await coldContainer.evaluate((element, previous) => element === previous, coldContainerHandle)).toBe(true);
      routeDiagnostics.push({ round, path, resourceCount, minHeight: Math.min(...frames.map((frame) => frame.height)), maxHeight: Math.max(...frames.map((frame) => frame.height)), headerFrames: frames.filter((frame) => frame.header).length });
    }
  }
  console.log(`[route-stability] ${JSON.stringify(routeDiagnostics)}`);

  let releaseAnalyticsRequest: (() => void) | undefined;
  let analyticsRequestStarted = false;
  const analyticsRequestGate = new Promise<void>((resolve) => { releaseAnalyticsRequest = resolve; });
  await page.route("**/api/analytics/worklogs*", async (route) => {
    analyticsRequestStarted = true;
    await analyticsRequestGate;
    await route.continue();
  }, { times: 1 });
  const analyticsLink = coldSidebar.locator('a[href="/app/analytics"]').first();
  if (await analyticsLink.count() === 0) await coldSidebar.getByRole("button", { name: "成长与复盘", exact: true }).click();
  await analyticsLink.click();
  await expect.poll(() => analyticsRequestStarted).toBe(true);
  await expect(page.getByRole("heading", { name: "数据统计", exact: true })).toBeVisible();
  const latencyFrames = await page.evaluate(() => new Promise<Array<{ height: number; header: boolean; children: number }>>((resolve) => {
    const samples: Array<{ height: number; header: boolean; children: number }> = [];
    const sample = () => {
      const container = document.querySelector<HTMLElement>('[data-testid="page-container"]');
      samples.push({ height: container?.getBoundingClientRect().height ?? 0, header: Boolean(container?.querySelector("h1")), children: container?.childElementCount ?? 0 });
      if (samples.length >= 8) resolve(samples); else requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }));
  expect(latencyFrames.every((frame) => frame.height >= 400 && frame.header && frame.children > 0)).toBe(true);
  releaseAnalyticsRequest?.();
  await expect(page.getByRole("heading", { name: "数据统计", exact: true })).toBeVisible();

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

  const timezoneClient = await page.context().newCDPSession(page);
  await timezoneClient.send("Emulation.setTimezoneOverride", { timezoneId: "UTC" });
  await page.goto("/app/calendar");
  await expect(
    page.getByRole("heading", { name: "日历", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "新建日程" }).click();
  await page.getByLabel("日程标题").fill(currentCalendarTitle);
  const currentEventStart = new Date(Date.now() + 60 * 60 * 1000);
  const currentEventEnd = new Date(currentEventStart.getTime() + 60 * 60 * 1000);
  const localInput = (value: Date) => {
    const pad = (part: number) => String(part).padStart(2, "0");
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
  };
  await page.getByLabel("开始时间").fill(localInput(currentEventStart));
  await page.getByLabel("结束时间").fill(localInput(currentEventEnd));
  await page.getByRole("button", { name: "保存日程" }).click();
  await expect(page.getByRole("status")).toContainText("日程已保存");
  await expect(page.getByText(currentCalendarTitle).first()).toBeVisible();

  await page.getByRole("button", { name: "新建日程" }).click();
  await page.getByLabel("日程标题").fill(fixedCalendarTitle);
  const businessToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
  await page.getByLabel("开始时间").fill(`${businessToday}T15:30`);
  await page.getByLabel("结束时间").fill(`${businessToday}T22:00`);
  await page.getByRole("button", { name: "保存日程" }).click();
  await expect(page.getByRole("status")).toContainText("日程已保存");
  await expect(page.getByText(fixedCalendarTitle).first()).toBeVisible();

  await page.getByRole("button", { name: "新建日程" }).click();
  await page.getByLabel("日程标题").fill(nextCalendarTitle);
  const eventStart = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const eventEnd = new Date(eventStart.getTime() + 60 * 60 * 1000);
  await page.getByLabel("开始时间").fill(localInput(eventStart));
  await page.getByLabel("结束时间").fill(localInput(eventEnd));
  await page.getByRole("button", { name: "保存日程" }).click();
  await expect(page.getByRole("status")).toContainText("日程已保存");
  await expect(page.getByText(nextCalendarTitle).first()).toBeVisible();

  const dragCalendarSelection = async (view: "Week" | "Day", title: string) => {
    await page.locator(`.fc-timeGrid${view}-button`).click();
    await page.locator(".fc-timegrid").scrollIntoViewIfNeeded();
    const column = page.locator(".fc-timegrid-col[data-date]").first();
    const startSlot = page.locator('.fc-timegrid-slot-lane[data-time="09:00:00"]').first();
    const endSlot = page.locator('.fc-timegrid-slot-lane[data-time="10:00:00"]').first();
    const [columnBox, startBox, endBox] = await Promise.all([
      column.boundingBox(),
      startSlot.boundingBox(),
      endSlot.boundingBox(),
    ]);
    expect(columnBox).not.toBeNull();
    expect(startBox).not.toBeNull();
    expect(endBox).not.toBeNull();
    const x = columnBox!.x + columnBox!.width / 2;
    await page.mouse.move(x, startBox!.y + 2);
    await page.mouse.down();
    await page.mouse.move(x, endBox!.y + 2, { steps: 12 });
    await page.mouse.up();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("开始时间")).toHaveValue(/T09:00$/);
    await expect(dialog.getByLabel("结束时间")).toHaveValue(/T10:30$/);
    await dialog.getByLabel("日程标题").fill(title);
    await dialog.getByRole("button", { name: "保存日程" }).click();
    await expect(page.getByRole("status")).toContainText("日程已保存");
    await expect(page.getByText(title).first()).toBeVisible();
  };

  await dragCalendarSelection("Week", "E2E 周视图拖动日程");
  await dragCalendarSelection("Day", "E2E 日视图拖动日程");
  for (const view of ["Week", "Day"] as const) {
    await page.locator(`.fc-timeGrid${view}-button`).click();
    const event = page.locator(".fc-timegrid-event").filter({ hasText: fixedCalendarTitle }).first();
    const startSlot = page.locator('.fc-timegrid-slot-lane[data-time="15:30:00"]').first();
    const endSlot = page.locator('.fc-timegrid-slot-lane[data-time="22:00:00"]').first();
    const [eventBox, startBox, endBox] = await Promise.all([event.boundingBox(), startSlot.boundingBox(), endSlot.boundingBox()]);
    expect(eventBox).not.toBeNull();
    expect(startBox).not.toBeNull();
    expect(endBox).not.toBeNull();
    expect(Math.abs(eventBox!.y - startBox!.y)).toBeLessThanOrEqual(4);
    expect(Math.abs(eventBox!.y + eventBox!.height - endBox!.y)).toBeLessThanOrEqual(6);
  }
  await page.locator(".fc-timeGridWeek-button").click();
  const findStableEvent = () => page.locator(".fc-timegrid-event").filter({ hasText: currentCalendarTitle }).first();
  await findStableEvent().scrollIntoViewIfNeeded();
  const scrollBeforeDrag = await page.evaluate(() => window.scrollY);
  for (let index = 0; index < 15; index += 1) {
    const stableEvent = findStableEvent();
    await expect(stableEvent).toBeVisible();
    const box = await stableEvent.locator(".calendar-event-content").boundingBox();
    expect(box).not.toBeNull();
    const delta = index % 2 === 0 ? 18 : -18;
    const response = page.waitForResponse((value) => value.request().method() === "PUT" && value.url().includes("/api/calendar/events/"));
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2 + delta, { steps: 6 });
    await page.mouse.up();
    expect((await response).ok()).toBe(true);
    await expect(findStableEvent()).toBeVisible();
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBeforeDrag);
  }
  for (let index = 0; index < 5; index += 1) {
    const stableEvent = findStableEvent();
    await expect(stableEvent).toBeVisible();
    await stableEvent.locator(".calendar-event-content").hover();
    const handle = stableEvent.locator(".fc-event-resizer-end");
    const handleBox = await handle.boundingBox();
    expect(handleBox).not.toBeNull();
    const response = page.waitForResponse((value) => value.request().method() === "PUT" && value.url().includes("/api/calendar/events/"));
    await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2 + (index % 2 === 0 ? 30 : -30), { steps: 12 });
    await page.mouse.up();
    expect((await response).ok()).toBe(true);
    await expect(findStableEvent()).toBeVisible();
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBeforeDrag);
  }
  expect(browserErrors).toEqual([]);

  for (const zoom of [1, 1.25]) {
    await page.evaluate((value) => { document.documentElement.style.zoom = String(value); }, zoom);
    for (const view of ["dayGridMonth", "timeGridWeek", "timeGridDay"] as const) {
      await page.locator(`.fc-${view}-button`).click();
      const event = page.locator(".fc-event").filter({ hasText: fixedCalendarTitle }).first();
      await expect(event).toBeVisible();
      await event.locator(".calendar-event-content").hover({ force: true });
      const tooltip = page.getByTestId("calendar-event-tooltip");
      await expect(tooltip).toBeVisible();
      await expect(tooltip).toHaveCSS("position", "fixed");
      expect(Number(await tooltip.evaluate((element) => getComputedStyle(element).zIndex))).toBeGreaterThanOrEqual(100);
      const tooltipBox = await tooltip.boundingBox();
      const viewport = page.viewportSize();
      expect(tooltipBox).not.toBeNull();
      expect(viewport).not.toBeNull();
      expect(tooltipBox!.x).toBeGreaterThanOrEqual(0);
      expect(tooltipBox!.y).toBeGreaterThanOrEqual(0);
      expect(tooltipBox!.x + tooltipBox!.width).toBeLessThanOrEqual(viewport!.width);
      expect(tooltipBox!.y + tooltipBox!.height).toBeLessThanOrEqual(viewport!.height);
    }
  }
  await page.evaluate(() => { document.documentElement.style.zoom = ""; });

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
  const reviewWorkspace = page.getByTestId("review-workspace");
  const reviewWorkspaceHandle = await reviewWorkspace.elementHandle();
  expect(reviewWorkspaceHandle).not.toBeNull();
  for (const tab of ["每周", "每月", "每日"]) {
    await page.getByRole("tab", { name: tab }).click();
    await expect(reviewWorkspace).toBeVisible();
    expect(await reviewWorkspace.evaluate((element, previous) => element === previous, reviewWorkspaceHandle)).toBe(true);
  }
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
