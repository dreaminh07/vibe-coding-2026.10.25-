import { expect, test } from "@playwright/test";

test("dates, periods and loading change the displayed results", async ({ page }) => {
  const externalRequests: string[] = [];
  await page.route("**/*", (route) => {
    if (new URL(route.request().url()).hostname !== "127.0.0.1") {
      externalRequests.push(route.request().url());
      return route.abort();
    }
    return route.continue();
  });
  await page.goto("/");
  await expect(page.getByRole("table")).toBeVisible();
  await page.getByLabel("조회 날짜").fill("2026-09-07");
  await expect(page.getByRole("heading", { name: "박스오피스 데이터를 불러오는 중입니다." })).toBeVisible();
  await expect(page.getByRole("table")).not.toBeVisible();
  await expect(page.locator("tbody tr").first()).toContainText("바다 너머의 우리");
  await expect(page.locator("tbody tr").first()).toContainText("145,200,000");
  await page.getByRole("button", { name: "주간", exact: true }).click();
  await expect(page.getByText("2026-09-07 ~ 2026-09-13", { exact: true })).toBeVisible();
  await expect(page.locator("tbody tr").first()).toContainText("1,310,400,000");
  await page.getByRole("button", { name: "주말", exact: true }).click();
  await expect(page.getByText("2026-09-11 ~ 2026-09-13", { exact: true })).toBeVisible();
  await expect(page.getByRole("row", { name: /바다 너머의 우리/ })).toContainText("645,600,000");
  await page.getByRole("button", { name: "새로고침" }).click();
  await expect(page.getByRole("heading", { name: "박스오피스 데이터를 불러오는 중입니다." })).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  expect(externalRequests).toEqual([]);
});

test("partial search, no match and clearing are different from empty data", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("table")).toBeVisible();
  await page.getByLabel("영화명 검색").fill(" 바다 ");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.getByRole("row", { name: /바다 너머의 우리/ })).toBeVisible();
  await page.getByLabel("영화명 검색").fill("없는 제목");
  await expect(page.getByRole("heading", { name: "검색 결과가 없습니다" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "제공되는 데이터가 없습니다" })).not.toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("search-empty.png"), fullPage: true });
  await page.getByRole("button", { name: "검색어 지우기" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(5);
});

test("September 6 is normal empty for all period types and can recover", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("table")).toBeVisible();
  await page.getByLabel("조회 날짜").fill("2026-09-06");
  for (const type of ["일간", "주간", "주말"]) {
    await page.getByRole("button", { name: type, exact: true }).click();
    await expect(page.getByRole("heading", { name: "제공되는 데이터가 없습니다" })).toBeVisible();
    await expect(page.getByRole("main").getByRole("alert")).not.toBeVisible();
    await expect(page.getByRole("table")).not.toBeVisible();
  }
  await page.screenshot({ path: testInfo.outputPath("empty.png"), fullPage: true });
  await page.getByRole("button", { name: "샘플 날짜로 돌아가기" }).click();
  await expect(page.getByRole("table")).toBeVisible();
});

test("September 14 shows error, retries the same query and recovers on changing date", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("table")).toBeVisible();
  await page.getByLabel("조회 날짜").fill("2026-09-14");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("데이터를 불러오지 못했습니다.");
  await expect(page.getByRole("table")).not.toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("error.png"), fullPage: true });
  const retried = page.waitForResponse((response) => response.url().includes("date=2026-09-14") && response.status() === 502);
  await page.getByRole("button", { name: "다시 시도" }).click();
  await expect(page.getByRole("heading", { name: "박스오피스 데이터를 불러오는 중입니다." })).toBeVisible();
  await retried;
  await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
  await page.getByLabel("조회 날짜").fill("2026-09-13");
  await expect(page.getByRole("table")).toBeVisible();
});

test("a late response cannot replace the most recently selected date", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("table")).toBeVisible();
  let started!: () => void;
  const intercepted = new Promise<void>((resolve) => { started = resolve; });
  await page.route("**/api/box-office?date=2026-09-07&*", async (route) => {
    started();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    try { await route.continue(); } catch { /* The superseded request may already be cancelled. */ }
  });
  await page.getByLabel("조회 날짜").fill("2026-09-07");
  await intercepted;
  await page.getByLabel("조회 날짜").fill("2026-09-08");
  await expect(page.getByText("2026-09-08 ~ 2026-09-08", { exact: true })).toBeVisible();
  await page.waitForTimeout(1700);
  await expect(page.getByText("2026-09-08 ~ 2026-09-08", { exact: true })).toBeVisible();
});
