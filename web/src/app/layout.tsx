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
        className={`${geistSans.variable} ${geistMono.variable} bg-[#FAFAFA] text-neutral-900 antialiased selection:bg-indigo-500 selection:text-white`}
      >
        <div className="min-h-screen relative flex flex-col">
          <Navbar />
          {/* Padding top adjusted for floating navbar */}
          <main className="flex-1 w-full max-w-md mx-auto px-5 pb-24 pt-6">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}