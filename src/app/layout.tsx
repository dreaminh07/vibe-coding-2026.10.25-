import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "박스오피스 인사이트",
  description: "날짜별 박스오피스와 매출·관객 흐름을 살펴보는 영화 인사이트 대시보드",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
