"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AlertCircle, Home, Loader2, MapPin, Printer, ScrollText } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import { fetchPropertyReport, type PropertyReport } from "@/lib/admin-property-api";
import {
  reprintCollectionIssueNotice,
  COLLECTION_ISSUE_TYPE_LABELS,
  NOTICE_LANGUAGE_LABELS,
  type GeneratedCollectionIssueNotice,
} from "@/lib/admin-api";
import { FieldVerificationPhotos } from "@/components/admin/field-verification-photos";
import { CollectionIssueNoticeView } from "@/components/admin/collection-issue-notice-view";

const ALLOWED_ROLES = ["commissioner", "deputy_commissioner", "city_manager"];

function money(v: unknown): string {
  const n = Number(v ?? 0);
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function str(v: unknown): string {
  return v === null || v === undefined || v === "" ? "-" : String(v);
}

function fmtDateTime(v: string | null | undefined): string {
  if (!v) return "-";
  return new Date(v).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function statusBadge(status: string) {
  const positive = status === "approved" || status === "resolved";
  const negative = status === "rejected" || status === "reverted" || status === "dismissed";
  const cls = positive ? "bg-green-100 text-green-700" : negative ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700";
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${cls}`}>{status}</span>;
}

export default function PropertyWiseReportDetailPage() {
  const admin = useAdminGuard();
  const params = useParams();
  const holdingNo = String(params.holdingNo);

  const [report, setReport] = useState<PropertyReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openNotice, setOpenNotice] = useState<GeneratedCollectionIssueNotice | null>(null);
  const [openingNoticeId, setOpeningNoticeId] = useState<number | null>(null);

  async function handleReprint(noticeId: number) {
    setOpeningNoticeId(noticeId);
    setError(null);
    try {
      setOpenNotice(await reprintCollectionIssueNotice(noticeId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this notice.");
    } finally {
      setOpeningNoticeId(null);
    }
  }

  useEffect(() => {
    if (!admin || !ALLOWED_ROLES.includes(admin.role)) return;
    fetchPropertyReport(holdingNo)
      .then(setReport)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load this property's report."));
  }, [admin, holdingNo]);

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
            The property-wise report is restricted to the Municipal Commissioner, Deputy Municipal Commissioner, and City Manager.
          </div>
        </main>
      </div>
    );
  }

  const p = report?.property;

  if (openNotice) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <main className="mx-auto max-w-3xl px-6 py-10">
          <CollectionIssueNoticeView notice={openNotice} onClose={() => setOpenNotice(null)} />
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
        ) : !p ? (
          <p className="text-sm text-slate-400">Property not found.</p>
        ) : (
          <>
            <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold text-slate-900">
              <Home className="h-6 w-6" />
              {holdingNo} - {str(p.owner_name)}
            </h1>
            <p className="mb-6 text-sm text-slate-500">{str(p.address)}</p>

            {report.dispute?.isDisputed && (
              <div role="alert" className="mb-6 flex items-start gap-2 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <b>This holding is marked as DISPUTED</b> - hidden from public search, no demand notice and no payment until cleared.
                  <div className="mt-1 text-xs">Reason: {str(report.dispute.remarks)}</div>
                </div>
              </div>
            )}

            {/* Property details */}
            <section className="mb-6 rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="mb-4 text-sm font-semibold text-slate-700">Property Details</h2>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                <div><dt className="text-xs text-slate-400">Holding No</dt><dd className="font-mono">{str(p.holding_no)}</dd></div>
                <div><dt className="text-xs text-slate-400">Old Holding No</dt><dd>{str(p.old_holding_no)}</dd></div>
                <div><dt className="text-xs text-slate-400">Owner</dt><dd>{str(p.owner_name)}</dd></div>
                <div><dt className="text-xs text-slate-400">Relation</dt><dd>{str(p.relation_type)} {str(p.relation_name) !== "-" ? str(p.relation_name) : ""}</dd></div>
                <div><dt className="text-xs text-slate-400">Mobile</dt><dd>{str(p.mobile_no)}</dd></div>
                <div><dt className="text-xs text-slate-400">Ward / Zone</dt><dd>{str(p.ward)} / {str(p.zone)}</dd></div>
                <div><dt className="text-xs text-slate-400">Area (sqft)</dt><dd>{str(p.area_sqft)}</dd></div>
                <div><dt className="text-xs text-slate-400">Vacant Area (sqft)</dt><dd>{str(p.vacant_area_sqft)}</dd></div>
                <div><dt className="text-xs text-slate-400">Road Type</dt><dd>{str(p.road_type)}</dd></div>
                <div><dt className="text-xs text-slate-400">Assessment Year</dt><dd>{str(p.assessment_year)}</dd></div>
                <div><dt className="text-xs text-slate-400">Rain Water Harvesting</dt><dd>{p.rain_water_harvesting ? "Yes" : "No"}</dd></div>
                <div><dt className="text-xs text-slate-400">Solar Rooftop</dt><dd>{p.solar_rooftop ? "Yes" : "No"}</dd></div>
              </dl>

              {report.floors && report.floors.length > 0 && (
                <div className="mt-5 border-t border-slate-100 pt-4">
                  <p className="mb-2 text-xs font-semibold text-slate-600">Floors</p>
                  <table className="w-full text-xs">
                    <thead className="text-left text-slate-400">
                      <tr>
                        <th className="py-1 pr-3">Floor</th>
                        <th className="py-1 pr-3">Area (sqft)</th>
                        <th className="py-1 pr-3">Construction</th>
                        <th className="py-1 pr-3">Usage</th>
                        <th className="py-1 pr-3">Occupancy</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.floors.map((f, i) => (
                        <tr key={i} className="border-t border-slate-100">
                          <td className="py-1.5 pr-3">{f.floor_label}</td>
                          <td className="py-1.5 pr-3">{f.buildup_sqft}</td>
                          <td className="py-1.5 pr-3">{f.const_type}</td>
                          <td className="py-1.5 pr-3">{f.usage_type}</td>
                          <td className="py-1.5 pr-3">{f.occupancy}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Tax pending */}
            <section className="mb-6 rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="mb-4 text-sm font-semibold text-slate-700">Tax Pending</h2>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                <div><dt className="text-xs text-slate-400">Current Year Tax</dt><dd>₹{money(p.currentTax)}</dd></div>
                <div><dt className="text-xs text-slate-400">Pending Arrears</dt><dd>₹{money(p.pendingArrearsTotal)}</dd></div>
                <div><dt className="text-xs text-slate-400">Penalty</dt><dd>₹{money(p.autoPenalty)}</dd></div>
              </dl>
              <div className={`mt-4 rounded-md p-3 text-sm font-semibold ${Number(p.totalPayable ?? 0) > 0 ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
                Total Payable: ₹{money(p.totalPayable)}
              </div>
            </section>

            {/* Dispute trail */}
            <section className="mb-6 rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
                Dispute Status &amp; Trail ({report.dispute?.history.length ?? 0})
                {report.dispute?.isDisputed ? (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-red-700">Disputed</span>
                ) : (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-green-700">Not disputed</span>
                )}
              </h2>
              {!report.dispute || report.dispute.history.length === 0 ? (
                <p className="text-sm text-slate-400">This holding has never been flagged as disputed.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="text-slate-400">
                      <tr>
                        <th className="pb-2 pr-4">When</th>
                        <th className="pb-2 pr-4">Action</th>
                        <th className="pb-2 pr-4">By</th>
                        <th className="pb-2">Remarks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.dispute.history.map((h, i) => (
                        <tr key={i} className="border-t border-slate-100 align-top">
                          <td className="py-2 pr-4 whitespace-nowrap">{fmtDateTime(h.actedAt)}</td>
                          <td className="py-2 pr-4">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${h.action === "flagged" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                              {h.action === "flagged" ? "Flagged disputed" : "Dispute cleared"}
                            </span>
                          </td>
                          <td className="py-2 pr-4">
                            {h.actedBy} <span className="text-slate-400">({h.actedByRole.replace("_", " ")})</span>
                          </td>
                          <td className="py-2">{h.remarks}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Change log */}
            <section className="mb-6 rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="mb-4 text-sm font-semibold text-slate-700">Log of Changes Made or Pending ({report.changeRequests.length})</h2>
              {report.changeRequests.length === 0 ? (
                <p className="text-sm text-slate-400">No mutation has ever been requested for this holding.</p>
              ) : (
                <div className="space-y-3">
                  {report.changeRequests.map((r) => (
                    <div key={r.id} className="rounded-md border border-slate-200 p-3 text-xs">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="font-semibold text-slate-700">{fmtDateTime(r.requested_at)} - {r.requested_by}</span>
                        {statusBadge(r.status)}
                      </div>
                      <p className="text-slate-600">Basis: {r.change_basis} - {r.change_reference}</p>
                      {r.status === "pending" && <p className="mt-1 text-amber-700">Currently pending at {r.current_stage}</p>}
                      {r.reviewed_by && (
                        <p className="mt-1 text-slate-400">
                          Reviewed by {r.reviewed_by} ({r.reviewed_role}) on {fmtDateTime(r.reviewed_at)}
                          {r.review_notes && ` - "${r.review_notes}"`}
                        </p>
                      )}
                      {r.reverted_by && (
                        <p className="mt-1 text-red-600">
                          Reverted by {r.reverted_by} on {fmtDateTime(r.reverted_at)}
                          {r.revert_comment && ` - "${r.revert_comment}"`}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Discrepancy flags */}
            <section className="mb-6 rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="mb-4 text-sm font-semibold text-slate-700">Discrepancies Reported ({report.discrepancies.length})</h2>
              {report.discrepancies.length === 0 ? (
                <p className="text-sm text-slate-400">No discrepancy has been reported for this holding.</p>
              ) : (
                <div className="space-y-3">
                  {report.discrepancies.map((d) => (
                    <div key={d.id} className="rounded-md border border-slate-200 p-3 text-xs">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="font-semibold text-slate-700">{fmtDateTime(d.reported_at)} - {d.reported_by_display_name}</span>
                        {statusBadge(d.status)}
                      </div>
                      <p className="text-slate-600">{d.discrepancy_notes}</p>
                      {d.reviewed_by && (
                        <p className="mt-1 text-slate-400">
                          Reviewed by {d.reviewed_by} ({d.reviewed_role}) on {fmtDateTime(d.reviewed_at)}
                          {d.review_notes && ` - "${d.review_notes}"`}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Resurvey flags */}
            <section className="mb-6 rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="mb-4 text-sm font-semibold text-slate-700">Re-survey Flags ({report.resurveyFlags.length})</h2>
              {report.resurveyFlags.length === 0 ? (
                <p className="text-sm text-slate-400">No re-survey flag has been raised for this holding.</p>
              ) : (
                <div className="space-y-3">
                  {report.resurveyFlags.map((f) => (
                    <div key={f.id} className="rounded-md border border-slate-200 p-3 text-xs">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="font-semibold text-slate-700">{fmtDateTime(f.flagged_at)} - {f.flagged_by_display_name}</span>
                        {statusBadge(f.status)}
                      </div>
                      <p className="text-slate-600">{f.remarks}</p>
                      {f.reviewed_by_display_name && (
                        <p className="mt-1 text-slate-400">
                          Reviewed by {f.reviewed_by_display_name} on {fmtDateTime(f.reviewed_at)}
                          {f.review_notes && ` - "${f.review_notes}"`}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Surveyor field verifications */}
            <section className="mb-6 rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <MapPin className="h-4 w-4" />
                Field Visits, Photos & Documents ({report.fieldVerifications.length})
              </h2>
              {report.fieldVerifications.length === 0 ? (
                <p className="text-sm text-slate-400">No field visit has been logged for this holding.</p>
              ) : (
                <div className="space-y-2">
                  {report.fieldVerifications.map((v) => (
                    <div key={v.id} className="rounded-md border border-slate-200 p-3 text-xs">
                      <p className="font-semibold text-slate-700">{fmtDateTime(v.captured_at)} - {v.captured_by_display_name} ({v.captured_by_role})</p>
                      {v.gps_lat && v.gps_lng && (
                        <p className="mt-1 text-slate-500">GPS: {v.gps_lat}, {v.gps_lng}</p>
                      )}
                      <FieldVerificationPhotos visit={v} />
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Collection issues raised by Tax Collectors, and the notices issued against them */}
            <section className="mb-6 rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <ScrollText className="h-4 w-4" />
                Collection Issues &amp; Notices Issued ({report.collectionIssues.reduce((n, i) => n + i.notices.length, 0)} notice
                {report.collectionIssues.reduce((n, i) => n + i.notices.length, 0) === 1 ? "" : "s"})
              </h2>
              <p className="mb-4 text-xs text-slate-400">Every problem a Tax Collector reported while collecting from this holder, and each notice the City Manager issued for it.</p>
              {report.collectionIssues.length === 0 ? (
                <p className="text-sm text-slate-400">No collection issue has been raised against this holding.</p>
              ) : (
                <div className="space-y-3">
                  {report.collectionIssues.map((i) => (
                    <div key={i.id} className="rounded-md border border-slate-200 p-3 text-xs">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-700">{COLLECTION_ISSUE_TYPE_LABELS[i.issue_type]}</span>
                        {i.notices.length === 0 ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-700">Awaiting notice</span>
                        ) : (
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-green-700">Notice issued</span>
                        )}
                      </div>
                      <p className="text-slate-500">
                        Raised {fmtDateTime(i.reported_at)} by {i.reported_by_display_name}
                        {i.notes && ` - "${i.notes}"`}
                      </p>
                      {i.notices.length > 0 && (
                        <ul className="mt-2 divide-y divide-slate-100 border-t border-slate-100">
                          {i.notices.map((n) => (
                            <li key={n.id} className="flex items-center justify-between gap-3 py-2">
                              <span className="text-slate-600">
                                <span className="font-mono font-semibold text-slate-800">{n.notice_no}</span> · {NOTICE_LANGUAGE_LABELS[n.language]} · {fmtDateTime(n.generated_at)} by{" "}
                                {n.generated_by_display_name}
                                {n.demand_no && <span className="text-slate-400"> · Demand {n.demand_no}</span>}
                              </span>
                              <button
                                onClick={() => handleReprint(n.id)}
                                disabled={openingNoticeId === n.id}
                                className="inline-flex shrink-0 items-center gap-1 font-semibold text-nnm-blue hover:underline disabled:opacity-60"
                              >
                                <Printer className="h-3.5 w-3.5" />
                                {openingNoticeId === n.id ? "Opening…" : "View / Reprint"}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
