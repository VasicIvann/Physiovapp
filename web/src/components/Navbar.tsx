"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged } from "firebase/auth";
import { auth, isFirebaseConfigured } from "@/lib/firebase";

export function Navbar() {
  const [displayName, setDisplayName] = useState<string | null>(null);

  useEffect(() => {
    if (!auth || !isFirebaseConfigured) return;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setDisplayName(user?.displayName ?? null);
    });
    return () => unsubscribe();
  }, []);

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-md items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <img src="/physiovapp_v2.png" alt="Physiovapp" className="h-8 w-8 rounded-md object-cover" />
          <p className="text-sm font-semibold text-slate-800">Welcome</p>
        </div>
        <nav className="flex items-center gap-3 text-slate-700">
          <Link href="/" aria-label="Home" className="rounded-full p-2 transition hover:bg-slate-100">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M4 10.5 12 4l8 6.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M6.5 10.5V19h11v-8.5" strokeLinecap="round" />
            </svg>
          </Link>
          <Link href="/settings" aria-label="Settings" className="rounded-full p-2 transition hover:bg-slate-100">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
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
            className="flex items-center gap-1 rounded-full p-2 transition hover:bg-slate-100"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M5 20c1.5-2.5 4-3.8 7-3.8s5.5 1.3 7 3.8" strokeLinecap="round" />
            </svg>
            {displayName && (
              <span className="max-w-[120px] truncate text-xs font-semibold text-slate-800">{displayName}</span>
            )}
          </Link>
        </nav>
      </div>
    </header>
  );
}
