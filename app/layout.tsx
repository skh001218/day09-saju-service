import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://day09-saju-service.vercel.app"),
  title: "처음 만나는 쉬운 사주",
  description: "내 사주와 오행을 쉬운 말과 그림으로 알아보세요.",
  openGraph: {
    title: "처음 만나는 쉬운 사주",
    description: "내 사주와 오행을 쉬운 말과 그림으로 알아보세요.",
    type: "website",
    locale: "ko_KR",
  },
  twitter: {
    card: "summary_large_image",
    title: "처음 만나는 쉬운 사주",
    description: "내 사주와 오행을 쉬운 말과 그림으로 알아보세요.",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
