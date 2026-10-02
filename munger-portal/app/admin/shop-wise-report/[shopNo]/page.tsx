"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AlertCircle, CheckCircle2, Flag, Loader2, Store } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import { ADMIN_ROLE_LABELS } from "@/lib/admin-auth";
import { fetchShopReport, createShopFlag, type ShopReport } from "@/lib/admin-shop-api";

const ALLOWED_ROLES = ["commissioner", "city_manager"];

function money(v: string | number | null | undefined): string {
  const n = Number(v ?? 0);
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(v: string | null | undefined): string {
  if (!v) return "-";
  return new Date(v).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function fmtDateTime(v: string | null | undefined): string {
  if (!v) return "-";
  return new Date(v).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function ShopWiseReportDetailPage() {
  const admin = useAdminGuard();
  const params = useParams();
  const shopNo = String(params.shopNo);

  const [report, setReport] = useState<ShopReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [flagRemarks, setFlagRemarks] = useState("");
  const [flagging, setFlagging] = useState(false);
  const [flagError, setFlagError] = useState<string | null>(null);
  const [flagged, setFlagged] = useState(false);

  function load() {
    fetchShopReport(shopNo)
      .then(setReport)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load this shop's report."));
  }

  useEffect(() => {
    if (!admin || !ALLOWED_ROLES.includes(admin.role)) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin, shopNo]);

  async function handleFlag() {
    if (!flagRemarks.trim()) {
      setFlagError("Add a remark describing what needs correcting or explaining.");
      return;
    }
    setFlagging(true);
    setFlagError(null);
    try {
      await createShopFlag(shopNo, flagRemarks.trim());
      setFlagRemarks("");
      setFlagged(true);
      load();
    } catch (err) {
      setFlagError(err instanceof Error ? err.message : "Could not record this flag.");
    } finally {
      setFlagging(false);
    }
  }

  if (!admin) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  if (!ALLOWED_ROLES.includes(admin.role)) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <main className="mx-auto max-w-2xl px-6 py-10">
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            The shop-wise report is restricted to the Municipal Commissioner and City Manager.
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />

      <main className="mx-auto max-w-4xl px-6 py-10">
        {error && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {!report ? (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : (
          <>
            <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold text-slate-900">
              <Store className="h-6 w-6" />
              {report.shop.shop_no} {report.shop.market_name ? `- ${report.shop.market_name}` : ""}
            </h1>
            <p className="mb-6 text-sm text-slate-500">{report.shop.location}</p>

            {/* Shop details */}
            <section className="mb-6 rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="mb-4 text-sm font-semibold text-slate-700">Shop Details</h2>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                <div><dt className="text-xs text-slate-400">Shop No</dt><dd className="font-mono">{report.shop.shop_no}</dd></div>
                <div><dt className="text-xs text-slate-400">Market</dt><dd>{report.shop.market_name ?? "-"}</dd></div>
                <div><dt className="text-xs text-slate-400">Market Shop No</dt><dd>{report.shop.market_shop_number ?? "-"}</dd></div>
                <div><dt className="text-xs text-slate-400">Location</dt><dd>{report.shop.location}</dd></div>
                <div><dt className="text-xs text-slate-400">Ward</dt><dd>{report.shop.ward ?? "-"}</dd></div>
                <div><dt className="text-xs text-slate-400">Status</dt><dd className="capitalize">{report.shop.status}</dd></div>
                <div><dt className="text-xs text-slate-400">Total Area (sqft)</dt><dd>{report.shop.total_area_sqft ?? report.shop.area_sqft ?? "-"}</dd></div>
                <div><dt className="text-xs text-slate-400">Built-up Area (sqft)</dt><dd>{report.shop.built_up_area_sqft ?? "-"}</dd></div>
                <div><dt className="text-xs text-slate-400">Created By</dt><dd>{report.shop.created_by} - {fmtDate(report.shop.created_date)}</dd></div>
                <div><dt className="text-xs text-slate-400">Last Modified</dt><dd>{report.shop.last_modified_by ? `${report.shop.last_modified_by} - ${fmtDate(report.shop.last_modified_date)}` : "-"}</dd></div>
              </dl>
            </section>

            {/* Agreement history */}
            <section className="mb-6 rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="mb-4 text-sm font-semibold text-slate-700">Agreement Details &amp; History ({report.agreements.length})</h2>
              {report.agreements.length === 0 ? (
                <p className="text-sm text-slate-400">No agreement has been recorded for this shop.</p>
              ) : (
                <div className="space-y-4">
                  {report.agreements.map((a) => (
                    <div key={a.id} className={`rounded-md border p-4 text-sm ${a.status === "active" ? "border-green-200 bg-green-50" : "border-slate-200 bg-slate-50"}`}>
                      <div className="mb-2 flex items-center justify-between">
                        <span className="font-semibold text-slate-800">{a.holder_name}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${a.status === "active" ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-500"}`}>
                          {a.status}
                        </span>
                      </div>
                      <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-3">
                        <div><dt className="text-slate-400">Agreement No</dt><dd>{a.agreement_number ?? "-"}</dd></div>
                        <div><dt className="text-slate-400">Business Name</dt><dd>{a.business_name ?? "-"}</dd></div>
                        <div><dt className="text-slate-400">Mobile</dt><dd>{a.holder_mobile ?? "-"}</dd></div>
                        <div><dt className="text-slate-400">Base Monthly Rent</dt><dd>₹{money(a.base_monthly_rent)}</dd></div>
                        <div><dt className="text-slate-400">Security Deposit</dt><dd>₹{money(a.security_deposit)}</dd></div>
                        <div><dt className="text-slate-400">Rent Paid Till</dt><dd>{a.rent_paid_till_month ?? "-"}</dd></div>
                        <div><dt className="text-slate-400">Agreement Start</dt><dd>{fmtDate(a.agreement_start_date)}</dd></div>
                        <div><dt className="text-slate-400">Agreement End</dt><dd>{fmtDate(a.agreement_end_date)}</dd></div>
                        <div><dt className="text-slate-400">Address</dt><dd>{a.holder_address ?? "-"}</dd></div>
                      </dl>
                      <p className="mt-2 text-[11px] text-slate-400">
                        Recorded by {a.created_by} on {fmtDate(a.created_date)}
                        {a.last_modified_by && ` · last modified by ${a.last_modified_by} on ${fmtDate(a.last_modified_date)}`}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Change log */}
            <section className="mb-6 rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="mb-4 text-sm font-semibold text-slate-700">Log of Changes Requested ({report.editRequests.length})</h2>
              {report.editRequests.length === 0 ? (
                <p className="text-sm text-slate-400">No edit requests have been raised for this shop.</p>
              ) : (
                <div className="space-y-3">
                  {report.editRequests.map((r) => (
                    <div key={r.id} className="rounded-md border border-slate-200 p-3 text-xs">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="font-semibold text-slate-700">{fmtDateTime(r.requested_at)} - {r.requested_by}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                            r.status === "approved" ? "bg-green-100 text-green-700" : r.status === "rejected" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {r.status === "pending" ? `pending at ${ADMIN_ROLE_LABELS[r.current_stage as keyof typeof ADMIN_ROLE_LABELS] ?? r.current_stage}` : r.status}
                        </span>
                      </div>
                      <p className="text-slate-600">Reason: {r.change_reason}</p>
                      <p className="mt-1 text-slate-500">Proposed: {JSON.stringify(r.proposed_data)}</p>
                      {r.reviewed_by && (
                        <p className="mt-1 text-slate-400">
                          Reviewed by {r.reviewed_by} ({r.reviewed_role}) on {fmtDateTime(r.reviewed_at)}
                          {r.review_notes && ` - "${r.review_notes}"`}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Flags */}
            <section className="mb-6 rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Flag className="h-4 w-4" />
                Flags Raised for Stall Prabhari ({report.flags.length})
              </h2>

              {report.flags.length > 0 && (
                <div className="mb-5 space-y-3">
                  {report.flags.map((f) => (
                    <div key={f.id} className={`rounded-md border p-3 text-xs ${f.status === "open" ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"}`}>
                      <div className="mb-1 flex items-center justify-between">
                        <span className="font-semibold text-slate-700">
                          {fmtDateTime(f.flagged_at)} - {f.flagged_by_display_name} ({ADMIN_ROLE_LABELS[f.flagged_by_role as keyof typeof ADMIN_ROLE_LABELS] ?? f.flagged_by_role})
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${f.status === "open" ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>
                          {f.status}
                        </span>
                      </div>
                      <p className="text-slate-700">{f.remarks}</p>
                      {f.status === "resolved" && (
                        <p className="mt-2 rounded bg-white p-2 text-slate-600">
                          <span className="font-semibold">{f.resolved_by_display_name}&apos;s response</span> ({fmtDateTime(f.resolved_at)}): {f.resolution_notes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="border-t border-slate-100 pt-5">
                <p className="mb-2 text-xs font-medium text-slate-600">
                  Flag something on this shop - it goes straight to Stall Prabhari for correction or justification.
                </p>
                {flagged && (
                  <div role="status" className="mb-3 flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-2.5 text-xs text-green-800">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    Flag sent to Stall Prabhari.
                  </div>
                )}
                {flagError && (
                  <div role="alert" className="mb-3 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {flagError}
                  </div>
                )}
                <textarea
                  value={flagRemarks}
                  onChange={(e) => {
                    setFlagRemarks(e.target.value);
                    setFlagged(false);
                  }}
                  rows={3}
                  placeholder="What needs correcting or explaining?"
                  className="mb-3 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1"
                />
                <button
                  onClick={handleFlag}
                  disabled={flagging}
                  className="inline-flex items-center gap-2 rounded-md bg-nnm-blue px-4 py-2 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
                >
                  <Flag className="h-4 w-4" />
                  {flagging ? "Sending…" : "Flag for Stall Prabhari"}
                </button>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
