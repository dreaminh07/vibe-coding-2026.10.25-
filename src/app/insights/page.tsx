import Link from "next/link";
import { InsightsDashboard } from "@/components/insights-dashboard";

export const dynamic = "force-dynamic";

function yesterdayInKorea(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const today = new Date(`${value.year}-${value.month}-${value.day}T00:00:00Z`);
  today.setUTCDate(today.getUTCDate() - 1);
  return today.toISOString().slice(0, 10);
}

export default function InsightsPage() {
  const mode = process.env.DATA_MODE === "live" ? "live" : "demo";
  const initialEndDate = mode === "demo" ? "2026-09-13" : yesterdayInKorea();
  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: "2rem 1rem 5rem" }}>
      <nav><Link href="/">← 목록 화면</Link></nav>
      <InsightsDashboard initialEndDate={initialEndDate} mode={mode} />
    </main>
  );
}
