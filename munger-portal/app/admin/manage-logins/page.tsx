"use client";

import { useEffect, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import { ADMIN_ROLE_LABELS } from "@/lib/admin-auth";
import { fetchAdminAccounts, setAdminAccountActive, type AdminAccountSummary } from "@/lib/admin-api";

export default function ManageLoginsPage() {
  const admin = useAdminGuard();
  const [accounts, setAccounts] = useState<AdminAccountSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  useEffect(() => {
    if (!admin) return;
    fetchAdminAccounts()
      .then(setAccounts)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load accounts."));
  }, [admin]);

  async function handleToggle(acc: AdminAccountSummary) {
    setUpdatingId(acc.id);
    setError(null);
    try {
      const updated = await setAdminAccountActive(acc.id, !acc.active);
      setAccounts((list) => list!.map((a) => (a.id === updated.id ? updated : a)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update this account's status.");
    } finally {
      setUpdatingId(null);
    }
  }

  if (!admin) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />

      <main className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">Manage Logins</h1>
        <p className="mb-6 text-sm text-slate-500">
          Activate or deactivate any Tax Daroga, Deputy Commissioner, Commissioner, Tax Collector, or other officer
          login. Deactivating blocks that login immediately — it doesn&apos;t undo anything already saved. (Front-counter
          Operators have their own page; Attendance/Asset logins are managed from Attendance → Manage Logins.)
        </p>

        {error && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {!accounts ? (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Username</th>
                  <th className="px-5 py-3 font-medium">Role</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((acc) => (
                  <tr key={acc.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-5 py-3.5 font-medium text-slate-900">
                      {acc.display_name}
                      {acc.is_demo && (
                        <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-700">
                          Demo
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 font-mono text-slate-500">{acc.username}</td>
                    <td className="px-5 py-3.5 text-slate-700">
                      {ADMIN_ROLE_LABELS[acc.role]}
                      {acc.tax_collector_code && (
                        <span className="ml-2 font-mono text-xs text-slate-400">Code: {acc.tax_collector_code}</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                          acc.active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {acc.active ? "Active" : "Deactivated"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => handleToggle(acc)}
                        disabled={updatingId === acc.id || (acc.active && acc.id === admin.id)}
                        title={acc.active && acc.id === admin.id ? "You can't deactivate your own account." : undefined}
                        className={`rounded-md border px-3 py-1.5 text-xs font-semibold disabled:opacity-60 ${
                          acc.active
                            ? "border-red-200 text-red-600 hover:bg-red-50"
                            : "border-green-200 text-green-700 hover:bg-green-50"
                        }`}
                      >
                        {updatingId === acc.id ? "…" : acc.active ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
