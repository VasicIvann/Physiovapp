"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged } from "firebase/auth";
import { auth, isFirebaseConfigured } from "@/lib/firebase";
import { usePathname } from "next/navigation";

export function Navbar() {
  const [displayName, setDisplayName] = useState<string | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (!auth || !isFirebaseConfigured) return;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setDisplayName(user?.displayName ?? null);
    });
    return () => unsubscribe();
  }, []);

  // Helper pour styliser les liens actifs
  const getLinkClass = (path: string) => {
    const isActive = pathname === path;
    return `rounded-2xl p-2.5 transition-all duration-300 ${
      isActive 
        ? "bg-indigo-50 text-indigo-600 shadow-sm ring-1 ring-indigo-100" 
        : "text-neutral-400 hover:text-neutral-600 hover:bg-neutral-50"
    }`;
  };

  return (
    <header className="sticky top-4 z-50 mx-auto w-full max-w-md px-4">
      <div className="relative flex h-16 items-center justify-between rounded-3xl border border-white/60 bg-white/80 px-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl backdrop-saturate-150">
        
        {/* Logo Area */}
        <Link href="/" className="flex items-center gap-3 transition-transform active:scale-95">
          <div className="relative h-10 w-10 overflow-hidden rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-inner">
            <img src="/physiovapp_v2.png" alt="Physiovapp" className="h-full w-full object-cover p-0.5 mix-blend-overlay" />
          </div>
          <div className="flex flex-col">
            <p className="text-xs font-bold uppercase tracking-wider text-neutral-400">Welcome</p>
            <p className="text-sm font-bold text-neutral-800 leading-none">
              {displayName ? displayName.split(' ')[0] : 'Athlete'}
            </p>
          </div>
        </Link>

        {/* Navigation Actions */}
        <nav className="flex items-center gap-1">
          <Link href="/" aria-label="Home" className={getLinkClass("/")}>
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 10.5 12 4l8 6.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M6.5 10.5V19h11v-8.5" strokeLinecap="round" />
            </svg>
          </Link>
          
          <Link href="/settings" aria-label="Settings" className={getLinkClass("/settings")}>
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
              <path
                d="M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M4.5 12.8c.1.5.1 1 .3 1.5l-1 1.7 1.5 1.5 1.7-1c.5.2 1 .3 1.5.3l.5 1.9h2.1l.5-1.9c.5-.1 1-.1 1.5-.3l1.7 1 1.5-1.5-1-1.7c.2-.5.3-1 .3-1.5l1.9-.5v-2.1l-1.9-.5c-.1-.5-.1-1-.3-1.5l1-1.7-1.5-1.5-1.7 1c-.5-.2-1-.3-1.5-.3l-.5-1.9h-2.1l-.5 1.9c-.5.1-1 .1-1.5.3l-1.7-1-1.5 1.5 1 1.7c-.2.5-.3 1-.3 1.5l-1.9.5v2.1l1.9.5Z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
          
          <Link
            href="/account"
            aria-label="Account"
            className={getLinkClass("/account")}
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M5 20c1.5-2.5 4-3.8 7-3.8s5.5 1.3 7 3.8" strokeLinecap="round" />
            </svg>
          </Link>
        </nav>
      </div>
    </header>
  );
}