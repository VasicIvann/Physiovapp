"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { onAuthStateChanged, signOut, updatePassword, updateProfile } from "firebase/auth";
import { auth, db, isFirebaseConfigured } from "@/lib/firebase";

type UserProfile = {
  name: string;
  email: string;
  birthdate: string;
};

export default function AccountPage() {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [newName, setNewName] = useState("");
  const [newBirthdate, setNewBirthdate] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth || !db || !isFirebaseConfigured) {
      setLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        setUserProfile(null);
        setLoading(false);
        return;
      }
      try {
        const snap = await getDoc(doc(db!, "users", currentUser.uid));
        const data = snap.data() as UserProfile | undefined;
        const name = data?.name ?? currentUser.displayName ?? "";
        const birthdate = data?.birthdate ?? "";
        setUserProfile({
          name,
          email: currentUser.email ?? "",
          birthdate,
        });
        setNewName(name);
        setNewBirthdate(birthdate);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  const initials = useMemo(() => {
    if (!userProfile?.name) return "PV";
    return userProfile.name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }, [userProfile?.name]);

  const handleUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!auth || !db || !auth.currentUser) return;
    setMessage(null);
    setError(null);
    try {
      if (newName && newName !== userProfile?.name) {
        await updateProfile(auth.currentUser, { displayName: newName });
      }
      if (newBirthdate !== userProfile?.birthdate) {
        await setDoc(
          doc(db!, "users", auth.currentUser.uid),
          { name: newName || userProfile?.name || "", birthdate: newBirthdate, email: auth.currentUser.email ?? "" },
          { merge: true },
        );
      }
      if (newPassword.trim().length >= 6) {
        await updatePassword(auth.currentUser, newPassword);
      }
      setUserProfile((prev) =>
        prev
          ? {
              ...prev,
              name: newName || prev.name,
              birthdate: newBirthdate || prev.birthdate,
            }
          : prev,
      );
      setMessage("Profil mis a jour.");
      setNewPassword("");
    } catch (err) {
      console.error(err);
      setError("Impossible de mettre a jour le profil (re-auth necessaire si la session est ancienne).");
    }
  };

  const handleSignOut = async () => {
    if (!auth) return;
    await signOut(auth);
    setUserProfile(null);
  };

  if (!isFirebaseConfigured) {
    return (
      <div className="rounded-3xl border border-rose-500/40 bg-gradient-to-br from-rose-950/70 to-orange-950/60 p-5 shadow-sm">
        <p className="text-sm font-semibold text-rose-200">Configure Firebase pour utiliser le compte.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-3xl border border-cyan-500/30 bg-gradient-to-br from-slate-900 to-slate-800 p-5 shadow-sm">
        <p className="text-sm text-slate-200">Chargement du compte...</p>
      </div>
    );
  }

  if (!userProfile) {
    return (
      <div className="rounded-3xl border border-slate-700/70 bg-slate-900/85 p-5 shadow-sm backdrop-blur-sm">
        <p className="text-sm font-semibold text-slate-100">Tu n&apos;es pas connecte.</p>
        <div className="mt-3 flex gap-3">
          <Link href="/signin" className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white">
            Sign in
          </Link>
          <Link href="/signup" className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200">
            Sign up
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-3xl border border-cyan-500/35 bg-gradient-to-br from-slate-900 via-cyan-950 to-emerald-950 p-5 text-white shadow-[0_16px_35px_rgba(2,6,23,0.5)]">
        <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-cyan-300/20 blur-2xl" />
        <h1 className="text-lg font-black tracking-tight">Account</h1>
        <p className="mt-1 text-sm text-cyan-100/90">Met a jour tes informations et deconnecte-toi.</p>

        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-cyan-400/30 bg-slate-900/45 px-4 py-3 backdrop-blur-sm">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-500/20 text-cyan-100 font-semibold">
            {initials}
          </span>
          <div>
            <p className="text-sm font-semibold text-white">{userProfile.name || "Profil"}</p>
            <p className="text-xs text-cyan-100/85">{userProfile.email}</p>
          </div>
        </div>

        <form className="mt-4 space-y-3 rounded-3xl bg-slate-900/85 p-4 text-slate-100 ring-1 ring-cyan-500/20 backdrop-blur-sm" onSubmit={handleUpdate}>
          <label className="block text-sm font-medium text-slate-200">
            Name
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
            />
          </label>
          <label className="block text-sm font-medium text-slate-200">
            Birthdate
            <input
              type="date"
              value={newBirthdate}
              onChange={(e) => setNewBirthdate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
            />
          </label>
          <label className="block text-sm font-medium text-slate-200">
            New password
            <input
              type="password"
              minLength={6}
              placeholder="Laisse vide pour ne pas changer"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
            />
          </label>
          {message && <p className="text-sm font-semibold text-emerald-600">{message}</p>}
          {error && <p className="text-sm font-semibold text-rose-600">{error}</p>}
          <div className="flex flex-col gap-3">
            <button
              type="submit"
              className="w-full rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-500"
            >
              Mettre a jour
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-100 transition hover:bg-slate-800"
            >
              Sign out
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
