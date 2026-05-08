import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "비나우 공용 법인차량 예약",
  description: "비나우 공용 법인차량 예약 대시보드",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
