"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import { changeOwnPassword } from "@/lib/admin-api";

const inputClass = "w-full rounded-md border border-slate-300 px-3 py-2.5 pr-10 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1";

function PasswordField({ id, label, value, onChange, autoComplete }: { id: string; label: string; value: string; onChange: (v: string) => void; autoComplete: string }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <div className="relative">
        <input id={id} type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} className={inputClass} required />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600"
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

export default function ChangePasswordPage() {
  const admin = useAdminGuard();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!admin) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;

  const rules = [
    { ok: next.length >= 8, text: "At least 8 characters" },
    { ok: /[A-Za-z]/.test(next) && /\d/.test(next), text: "At least one letter and one number" },
    { ok: next !== "" && next === confirm, text: "New password and confirmation match" },
    { ok: next !== "" && next !== current, text: "Different from the current password" },
  ];

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!rules.every((r) => r.ok)) return setError("The new password does not meet all the rules below.");
    setBusy(true);
    try {
      await changeOwnPassword(current, next, confirm);
      setDone(true);
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change the password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />
      <main className="mx-auto max-w-md px-4 py-10 sm:px-6">
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <KeyRound className="h-6 w-6" /> Change Password
        </h1>
        <p className="mb-6 text-sm text-slate-500">Enter your current password, then the new password twice.</p>

        {admin.role !== "tax_collector" ? (
          <div role="alert" className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <AlertCircle className="h-4 w-4 shrink-0" /> Password change from here is available for the Tax Collector login.
          </div>
        ) : done ? (
          <div role="status" className="rounded-xl border border-green-200 bg-green-50 p-5 text-sm text-green-800">
            <p className="mb-3 flex items-center gap-2 font-semibold">
              <CheckCircle2 className="h-5 w-5" /> Password changed.
            </p>
            <p className="mb-4">Use the new password from your next login.</p>
            <Link href="/admin/dashboard" className="font-semibold text-nnm-blue hover:underline">
              Back to Dashboard
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
            <PasswordField id="current" label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" />
            <PasswordField id="new" label="New password" value={next} onChange={setNext} autoComplete="new-password" />
            <PasswordField id="confirm" label="Confirm new password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
            <ul className="space-y-1 text-xs">
              {rules.map((r) => (
                <li key={r.text} className={`flex items-center gap-1.5 ${r.ok ? "text-green-700" : "text-slate-400"}`}>
                  <CheckCircle2 className="h-3.5 w-3.5" /> {r.text}
                </li>
              ))}
            </ul>
            {error && (
              <p role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" /> {error}
              </p>
            )}
            <button
              type="submit"
              disabled={busy || !current}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-nnm-blue px-4 py-2.5 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Change password
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
