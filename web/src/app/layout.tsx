import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/Navbar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Physiovapp - Pilotage productivite & recuperation",
  description: "Journal mobile-first construit avec Next.js, Tailwind CSS et Firebase pour suivre tes routines physiques et mentales.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} bg-slate-100 antialiased`}
      >
        <div className="min-h-screen">
          <Navbar />
          <main className="mx-auto max-w-md px-4 pb-12 pt-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
