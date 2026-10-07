"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Trash2 } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import { decideSolidWasteRequest, fetchSolidWasteRequestsToApprove, type SolidWasteRequestForApproval } from "@/lib/admin-api";

export default function SolidWasteApprovalsPage() {
  const admin = useAdminGuard();
  const [rows, setRows] = useState<SolidWasteRequestForApproval[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    try {
      setRows(await fetchSolidWasteRequestsToApprove());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load requests.");
    }
  }, []);

  useEffect(() => {
    if (admin && (admin.role === "tax_daroga" || admin.role === "city_manager")) load();
  }, [admin, load]);

  async function decide(id: number, action: "approve" | "reject") {
    if (action === "reject" && reason.trim().length < 3) return setError("Please give a reason for rejecting.");
    setBusyId(id);
    setError(null);
    try {
      await decideSolidWasteRequest(id, action, reason.trim() || undefined);
      setRejectingId(null);
      setReason("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record this decision.");
    } finally {
      setBusyId(null);
    }
  }

  if (!admin) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  if (admin.role !== "tax_daroga" && admin.role !== "city_manager") {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <main className="mx-auto max-w-2xl px-6 py-10">
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            This is restricted to the Tax Daroga and City Manager.
          </div>
        </main>
      </div>
    );
  }

  const isDaroga = admin.role === "tax_daroga";
  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <Trash2 className="h-6 w-6" />
          Solid Waste User Type Approvals
        </h1>
        <p className="mb-6 text-sm text-slate-500">
          {isDaroga
            ? "Verify the solid waste user type entered by a Tax Collector. Verified entries go to the City Manager for final approval."
            : "Final approval of solid waste user types verified by the Tax Daroga. Approval applies the type and charge to the holding."}
        </p>
        {error && (
          <div role="alert" className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
        {!rows ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
            <CheckCircle2 className="h-4 w-4" /> Nothing waiting for you.
          </p>
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => (
              <li key={r.id} className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono font-semibold text-slate-900">{r.holding_no}</span>
                  <span className="text-xs text-slate-500">{new Date(r.requested_at).toLocaleString("en-IN")}</span>
                </div>
                <p className="mt-1 text-slate-600">
                  {r.owner_name} · {r.address}
                  {r.ward ? ` · Ward ${r.ward}` : ""}
                </p>
                <p className="mt-2">
                  Proposed type: <b>{r.requested_type}</b>
                  <span className="ml-2 text-xs text-slate-500">entered by {r.requested_by_display_name}</span>
                </p>
                {r.daroga_by && <p className="text-xs text-slate-500">Verified by Tax Daroga: {r.daroga_by}</p>}
                {rejectingId === r.id ? (
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Reason for rejecting"
                      className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                    <button onClick={() => decide(r.id, "reject")} disabled={busyId === r.id} className="rounded-md bg-red-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">
                      Confirm reject
                    </button>
                    <button onClick={() => setRejectingId(null)} className="rounded-md border border-slate-300 px-3 py-2 text-xs">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => decide(r.id, "approve")} disabled={busyId === r.id} className="rounded-md bg-nnm-blue px-4 py-2 text-xs font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60">
                      {isDaroga ? "Verify & forward" : "Approve"}
                    </button>
                    <button onClick={() => { setRejectingId(r.id); setReason(""); }} className="rounded-md border border-red-300 px-4 py-2 text-xs font-semibold text-red-700 hover:bg-red-50">
                      Reject
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
