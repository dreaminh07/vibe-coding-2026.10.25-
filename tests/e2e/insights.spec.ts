import { expect, test } from "@playwright/test";

test.describe("F2 demo 인사이트", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/insights");
  });

  test("7일 데이터와 관측 기준을 표시한다", async ({ page }) => {
    await expect(page.getByTestId("insight-count-loading")).toHaveText("0");
    await expect(page.getByTestId("insight-count-ok")).toHaveText("7");
    await expect(page.getByTestId("insight-count-empty")).toHaveText("0");
    await expect(page.getByText("377.5천명")).toBeVisible();
    await expect(page.getByText("10,000원")).toBeVisible();
    await expect(page.getByText(/전체 통계가 아닌 KOBIS 일별 Top 10 관측 데이터 기준/)).toBeVisible();
  });

  test("14일과 30일의 빈 날짜를 구분하고 불완전한 기간 집계를 숨긴다", async ({ page }) => {
    await page.getByRole("button", { name: "14일" }).click();
    await expect(page.getByTestId("insight-count-loading")).toHaveText("0");
    await expect(page.getByTestId("insight-count-ok")).toHaveText("7");
    await expect(page.getByTestId("insight-count-empty")).toHaveText("7");
    await expect(page.getByText("모든 날짜가 정상일 때만 기간 합계와 Top 5를 표시합니다.")).toBeVisible();

    await page.getByRole("button", { name: "30일" }).click();
    await expect(page.getByTestId("insight-count-loading")).toHaveText("0");
    await expect(page.getByTestId("insight-count-ok")).toHaveText("7");
    await expect(page.getByTestId("insight-count-empty")).toHaveText("23");
  });

  test("실패한 날짜만 다시 시도할 수 있다", async ({ page }) => {
    await page.getByLabel("종료일").fill("2026-09-14");
    await expect(page.getByTestId("insight-count-loading")).toHaveText("0");
    await expect(page.getByTestId("insight-count-error")).toHaveText("1");
    await expect(page.getByRole("button", { name: "이 날짜만 재시도" })).toHaveCount(1);
  });
});
