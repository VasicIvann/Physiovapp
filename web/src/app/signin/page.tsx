"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth, isFirebaseConfigured } from "@/lib/firebase";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!auth) {
      setStatus("error");
      return;
    }
    setStatus("loading");
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push("/account");
    } catch (error) {
      console.error(error);
      setStatus("error");
    }
  };

  if (!isFirebaseConfigured) {
    return (
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
        <p className="text-sm font-semibold text-rose-600">Configure Firebase pour activer la connexion.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
        <h1 className="text-lg font-semibold text-slate-900">Sign in</h1>
        <p className="mt-1 text-sm text-slate-600">Connecte-toi pour acceder a Physiovapp.</p>

        <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
          <label className="block text-sm font-medium text-slate-800">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
          </label>
          <label className="block text-sm font-medium text-slate-800">
            Password
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
          </label>
          {status === "error" && <p className="text-sm font-semibold text-rose-600">Connexion impossible.</p>}
          <button
            type="submit"
            disabled={status === "loading"}
            className="mt-1 flex w-full items-center justify-center rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-sky-300"
          >
            {status === "loading" ? "Connexion..." : "Sign in"}
          </button>
        </form>

        <p className="mt-3 text-center text-sm text-slate-600">
          Pas encore de compte ?{" "}
          <Link href="/signup" className="font-semibold text-sky-700 hover:underline">
            Creer un compte
          </Link>
        </p>
      </section>
    </div>
  );
}
