import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "AapkaCoach | AI-Powered Diet & Fitness Coach for Indians",
  description: "Get a personalised 7-day Indian meal plan, workout split, and progress tracker — built by AI around dal-roti, hostel budgets, and your exact body composition.",
  keywords: ["diet plan india", "AI nutritionist", "Indian meal plan", "body recomposition", "fat loss india", "hostel diet"],
  openGraph: {
    title: "AapkaCoach — AI Diet & Fitness Coach",
    description: "Personalised Indian meal plans, workout splits, and body progress tracking powered by DeepSeek AI.",
    type: "website",
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
  suppressHydrationWarning
  className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} h-full antialiased`}
>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
