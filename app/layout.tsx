import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next"
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "情壞留聲機",
  description: "聽懂你的台語，理解你的心情。用一句台語說出你的心聲，讓我們為你解鎖專屬的心情主題曲，用音樂陪伴你的喜怒哀樂。",

  openGraph: {
    title: "情懷留聲機",
    description: "聽懂你的台語，理解你的心情。用一句台語說出你的心聲，讓我們為你解鎖專屬的心情主題曲，用音樂陪伴你的喜怒哀樂。",
    url: "https://taigi-mood-jukebox.vercel.app", // 填入你上線後的完整網站網址
    type: "website",
    images: [
      {
        url: "https://taigi-mood-jukebox.vercel.app/og-image.png", // 圖片放在 public，但這裡要寫完整網址
        width: 1200,
        height: 630,
        alt: "情懷留聲機 網站縮圖",
      },
    ],
  },

  twitter: {
    card: "summary_large_image", // 這行最重要，確保呈現的是大卡片而不是小方塊
    title: "情懷留聲機",
    description: "聽懂你的台語，理解你的心情。用一句台語說出你的心聲，讓我們為你解鎖專屬的心情主題曲，用音樂陪伴你的喜怒哀樂。",
    images: ["https://taigi-mood-jukebox.vercel.app/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <Analytics />
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
