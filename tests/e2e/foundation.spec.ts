import { expect, test } from "@playwright/test";

test("foundation loads without API keys or fabricated box office data", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle("박스오피스 인사이트");
  await expect(page.locator("html")).toHaveAttribute("lang", "ko");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("영화의 흐름");
  await expect(page.getByRole("status")).toHaveText("아직 박스오피스 데이터가 연결되지 않았습니다.");
  await expect(page.getByRole("link", { name: "박스오피스 인사이트 홈" })).toHaveAttribute("href", "/");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("foundation.png"), fullPage: true });
});
