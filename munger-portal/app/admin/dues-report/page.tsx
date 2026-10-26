"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Loader2 } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import { downloadDuesReport, fetchDuesReportWards } from "@/lib/agency-api";

const ROLES = ["agency_operator", "agency_team_leader", "agency_project_manager", "tax_daroga", "city_manager", "deputy_commissioner", "commissioner"];
const inputClass = "w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1";

/** Excel of holdings with tax pending - for planning which owners to call / visit first. */
export default function DuesReportPage() {
  const admin = useAdminGuard();
  const [wards, setWards] = useState<{ ward: string; pending: number }[]>([]);
  const [ward, setWard] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [withMobile, setWithMobile] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (admin && ROLES.includes(admin.role)) fetchDuesReportWards().then(setWards).catch(() => setWards([]));
  }, [admin]);

  if (!admin) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  if (!ROLES.includes(admin.role)) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <main className="mx-auto max-w-2xl px-6 py-10">
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" /> This report is not available for your login.
          </div>
        </main>
      </div>
    );
  }

  async function download() {
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      await downloadDuesReport({ ward: ward || undefined, minAmount: Number(minAmount) || undefined, withMobile });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed.");
    } finally {
      setBusy(false);
    }
  }

  const totalPending = wards.reduce((t, w) => t + w.pending, 0);

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <FileSpreadsheet className="h-6 w-6" /> Holdings with Dues (Excel)
        </h1>
        <p className="mb-6 text-sm text-slate-500">
          Every holding with tax pending: holding number, old holding number, ward, owner, mobile number, tax paid till, and the total amount pending (from its current
          demand notice, refreshed on the 1st of each month). Sorted ward-wise, largest amount first, with a ward summary sheet.
        </p>

        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
          <div>
            <label htmlFor="ward" className="mb-1 block text-xs font-medium text-slate-500">
              Ward
            </label>
            <select id="ward" value={ward} onChange={(e) => setWard(e.target.value)} className={inputClass}>
              <option value="">All wards{totalPending ? ` (${totalPending.toLocaleString("en-IN")} holdings with dues)` : ""}</option>
              {wards.map((w) => (
                <option key={w.ward} value={w.ward}>
                  {w.ward === "(no ward)" ? "No ward recorded" : `Ward ${w.ward}`} - {w.pending.toLocaleString("en-IN")}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="min" className="mb-1 block text-xs font-medium text-slate-500">
              Only amounts of at least (Rs) - optional
            </label>
            <input id="min" inputMode="numeric" value={minAmount} onChange={(e) => setMinAmount(e.target.value.replace(/\D/g, ""))} placeholder="e.g. 5000" className={inputClass} />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={withMobile} onChange={(e) => setWithMobile(e.target.checked)} />
            Only holdings with a mobile number on record
          </label>
          <button
            onClick={download}
            disabled={busy}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-nnm-blue px-4 py-3 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {busy ? "Preparing…" : "Download Excel"}
          </button>
          {done && (
            <p className="flex items-center gap-1.5 text-sm text-green-700">
              <CheckCircle2 className="h-4 w-4" /> Downloaded.
            </p>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <p className="mt-4 text-xs text-slate-400">
          The list contains owners&apos; phone numbers - use it only for tax collection and do not share it outside the Nagar Nigam / agency team.
        </p>
      </main>
    </div>
  );
}
