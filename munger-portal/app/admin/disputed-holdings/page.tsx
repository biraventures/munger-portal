"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Loader2, Search, ShieldAlert } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import {
  fetchDisputeStatus,
  fetchDisputedHoldings,
  setHoldingDisputed,
  type DisputeStatus,
  type DisputedHoldingRow,
} from "@/lib/admin-api";

const ALLOWED = ["tax_daroga", "city_manager", "commissioner"];
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN") : "—");

export default function DisputedHoldingsPage() {
  const admin = useAdminGuard();
  const [holdingNo, setHoldingNo] = useState("");
  const [status, setStatus] = useState<DisputeStatus | null>(null);
  const [remarks, setRemarks] = useState("");
  const [list, setList] = useState<DisputedHoldingRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    try {
      setList(await fetchDisputedHoldings());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load disputed holdings.");
    }
  }, []);

  useEffect(() => {
    if (admin && ALLOWED.includes(admin.role)) loadList();
  }, [admin, loadList]);

  async function search(no: string) {
    const q = no.trim();
    if (!q) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    setRemarks("");
    try {
      setStatus(await fetchDisputeStatus(q));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this holding.");
    } finally {
      setBusy(false);
    }
  }

  async function apply(flag: boolean) {
    if (!status) return;
    if (remarks.trim().length < 5) return setError("Please enter remarks (the reason) - at least 5 characters.");
    setBusy(true);
    setError(null);
    try {
      setStatus(await setHoldingDisputed(status.holdingNo, flag, remarks.trim()));
      setRemarks("");
      await loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  if (!admin) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  if (!ALLOWED.includes(admin.role)) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <main className="mx-auto max-w-2xl px-6 py-10">
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            This is restricted to the Tax Daroga, City Manager and Commissioner.
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />
      <main className="mx-auto max-w-4xl space-y-6 px-6 py-8">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Disputed Holdings</h1>
          <p className="mt-1 text-sm text-slate-600">
            Flag a holding after an owner objection. While flagged: it is hidden from the public search, no payment is accepted
            from any login, and no demand notice can be generated. Clear the flag once the matter is settled.
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            search(holdingNo);
          }}
          className="flex gap-2"
        >
          <input
            value={holdingNo}
            onChange={(e) => setHoldingNo(e.target.value)}
            placeholder="Holding number, e.g. MUNG-01149"
            className="w-full max-w-sm rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-md bg-nnm-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Find
          </button>
        </form>

        {error && (
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {status && (
          <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-base font-semibold text-slate-900">{status.holdingNo}</div>
                <div className="text-sm text-slate-600">
                  {status.ownerName}
                  {status.ward ? ` · Ward ${status.ward}` : ""}
                </div>
              </div>
              {status.isDisputed ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
                  <ShieldAlert className="h-3.5 w-3.5" /> DISPUTED
                </span>
              ) : (
                <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">Not disputed</span>
              )}
            </div>

            {status.isDisputed && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                <b>Reason:</b> {status.remarks}
                <div className="mt-1 text-xs text-red-700">
                  Flagged by {status.disputedBy} ({status.disputedByRole?.replace("_", " ")}) on {fmt(status.disputedAt)}
                </div>
              </div>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="dispute-remarks">
                {status.isDisputed ? "Remarks for clearing the dispute" : "Remarks - reason for flagging as disputed"}
              </label>
              <textarea
                id="dispute-remarks"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                rows={3}
                maxLength={2000}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder={status.isDisputed ? "e.g. Owner objection resolved after re-survey on …" : "e.g. Owner has filed a written objection against the area / usage on …"}
              />
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => apply(!status.isDisputed)}
              className={`inline-flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60 ${status.isDisputed ? "bg-green-700" : "bg-red-700"}`}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {status.isDisputed ? "Clear Dispute" : "Flag as Disputed"}
            </button>

            {status.history.length > 0 && (
              <div className="pt-2">
                <h3 className="mb-1 text-sm font-semibold text-slate-800">History</h3>
                <ul className="space-y-1 text-xs text-slate-600">
                  {status.history.map((h, i) => (
                    <li key={i}>
                      <b>{h.action === "flagged" ? "Flagged" : "Cleared"}</b> by {h.actedBy} ({h.actedByRole.replace("_", " ")}) on {fmt(h.actedAt)} — {h.remarks}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-800">Currently disputed ({list?.length ?? "…"})</h2>
          {list && list.length === 0 && <p className="text-sm text-slate-500">No holding is currently marked as disputed.</p>}
          {list && list.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-600">
                  <tr>
                    <th className="p-2">Holding</th>
                    <th className="p-2">Owner</th>
                    <th className="p-2">Ward</th>
                    <th className="p-2">Remarks</th>
                    <th className="p-2">Flagged by / on</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => (
                    <tr key={r.holdingNo} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => { setHoldingNo(r.holdingNo); search(r.holdingNo); }}>
                      <td className="p-2 font-medium">{r.holdingNo}</td>
                      <td className="p-2">{r.ownerName}</td>
                      <td className="p-2">{r.ward}</td>
                      <td className="p-2">{r.remarks}</td>
                      <td className="p-2">
                        {r.disputedBy} · {fmt(r.disputedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
