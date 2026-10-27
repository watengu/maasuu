import type { Metadata } from "next";
import { Cormorant_Garamond, Noto_Sans_JP, Noto_Serif_JP } from "next/font/google";
import "./globals.css";

// 土台は Enaema の layout（フォント構成・LayoutProps）をそのまま踏襲。
// メタデータのみマァスゥ用。
const display = Cormorant_Garamond({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

// 日本語の見出し用セリフ（明朝）。display の日本語側を担う
const displayJp = Noto_Serif_JP({
  variable: "--font-display-jp",
  subsets: ["latin"],
  weight: ["600", "700"],
});

const body = Noto_Sans_JP({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "マァスゥ",
  description:
    "紹介制の小さなSNS。繋がりには期限があり、メッセージは24時間で消えます。残らないからこそ、軽く話せる場所。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ja"
      className={`${display.variable} ${displayJp.variable} ${body.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
