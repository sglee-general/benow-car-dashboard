import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "비나우 공용 법인차량 예약",
  description: "Slack slash command 기반 공용 법인차량 예약 캘린더"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
