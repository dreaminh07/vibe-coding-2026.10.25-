import { expect, test } from "@playwright/test";

test("demo loads without API keys and displays the fixture list", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle("박스오피스 인사이트");
  await expect(page.locator("html")).toHaveAttribute("lang", "ko");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("영화의 흐름");
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByRole("status")).toContainText("조회 성공 · 5편");
  await expect(page.getByRole("columnheader")).toHaveText(["순위", "영화명", "개봉일", "매출 (원)", "관객수 (명)", "누적 관객수 (명)"]);
  await expect(page.getByLabel("조회 날짜")).toHaveValue("2026-09-13");
  await expect(page.getByRole("row", { name: /파란 행성/ })).toContainText("-");
  await expect(page.getByRole("link", { name: "박스오피스 인사이트 홈" })).toHaveAttribute("href", "/");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("foundation.png"), fullPage: true });
});
