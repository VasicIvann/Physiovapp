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
        const snap = await getDoc(doc(db, "users", currentUser.uid));
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
          doc(db, "users", auth.currentUser.uid),
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
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
        <p className="text-sm font-semibold text-rose-600">Configure Firebase pour utiliser le compte.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
        <p className="text-sm text-slate-700">Chargement du compte...</p>
      </div>
    );
  }

  if (!userProfile) {
    return (
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
        <p className="text-sm font-semibold text-slate-900">Tu n&apos;es pas connecte.</p>
        <div className="mt-3 flex gap-3">
          <Link href="/signin" className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white">
            Sign in
          </Link>
          <Link href="/signup" className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-800">
            Sign up
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
        <h1 className="text-lg font-semibold text-slate-900">Account</h1>
        <p className="mt-1 text-sm text-slate-600">Met a jour tes informations et deconnecte-toi.</p>

        <div className="mt-4 flex items-center gap-3 rounded-xl border border-slate-100 px-4 py-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-100 text-sky-700 font-semibold">
            {initials}
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-900">{userProfile.name || "Profil"}</p>
            <p className="text-xs text-slate-600">{userProfile.email}</p>
          </div>
        </div>

        <form className="mt-4 space-y-3" onSubmit={handleUpdate}>
          <label className="block text-sm font-medium text-slate-800">
            Name
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
          </label>
          <label className="block text-sm font-medium text-slate-800">
            Birthdate
            <input
              type="date"
              value={newBirthdate}
              onChange={(e) => setNewBirthdate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
          </label>
          <label className="block text-sm font-medium text-slate-800">
            New password
            <input
              type="password"
              minLength={6}
              placeholder="Laisse vide pour ne pas changer"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
          </label>
          {message && <p className="text-sm font-semibold text-emerald-600">{message}</p>}
          {error && <p className="text-sm font-semibold text-rose-600">{error}</p>}
          <div className="flex flex-col gap-3">
            <button
              type="submit"
              className="w-full rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700"
            >
              Mettre a jour
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
            >
              Sign out
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
