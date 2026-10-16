"use client";

import { useEffect, useState } from "react";
import { AlertCircle, FileText, History, Loader2 } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import {
  fetchKhatianHistory,
  fetchKhatians,
  KHATIAN_STATUS,
  openKhatianPdf,
  reviewKhatian,
  SURVEY_WARDS,
  type Khatian,
  type KhatianStatus,
  type KhatianVersion,
  type KhatianWardSummary,
} from "@/lib/khatian-api";

const ALLOWED = ["deputy_commissioner", "commissioner", "city_manager", "abhilekh_prabhari"];

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
}

export default function KhatianReviewPage() {
  const admin = useAdminGuard();
  const [status, setStatus] = useState<KhatianStatus | "">("pending");
  const [ward, setWard] = useState("");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<Khatian[] | null>(null);
  const [summary, setSummary] = useState<KhatianWardSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<{ id: string; decision: "approve" | "return" } | null>(null);
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<{ id: string; versions: KhatianVersion[] } | null>(null);

  function load() {
    setRows(null);
    fetchKhatians({ status: status || undefined, ward: ward || undefined, q: search.trim() || undefined })
      .then((r) => {
        setRows(r.khatians);
        setSummary(r.summary);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load khatians."));
  }

  useEffect(() => {
    if (!admin || !ALLOWED.includes(admin.role)) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin, status, ward]);

  if (!admin) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  if (!ALLOWED.includes(admin.role)) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <p className="p-10 text-sm text-slate-500">This page is for the Deputy Municipal Commissioner.</p>
      </div>
    );
  }
  const canReview = admin.role === "deputy_commissioner";

  async function submit() {
    if (!acting) return;
    if (acting.decision === "return" && !remarks.trim()) return setError("Write what needs correcting.");
    setSaving(true);
    setError(null);
    try {
      await reviewKhatian(acting.id, acting.decision, remarks.trim());
      setActing(null);
      setRemarks("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the review.");
    } finally {
      setSaving(false);
    }
  }

  async function showHistory(id: string) {
    if (history?.id === id) return setHistory(null);
    try {
      setHistory({ id, versions: await fetchKhatianHistory(id) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the history.");
    }
  }

  const open = (id: string, version?: number) => openKhatianPdf(id, version).catch((err) => setError(err instanceof Error ? err.message : "Could not open the PDF."));

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">Khatian Review</h1>
        <p className="mb-6 text-sm text-slate-500">
          Scanned khatians uploaded by the Abhilekh Prabhari. Open each PDF and approve it, or return it with what needs correcting.
          {!canReview && " Only the Deputy Municipal Commissioner can approve or return."}
        </p>

        {error && (
          <div role="alert" className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="mb-5 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {SURVEY_WARDS.map((w) => {
            const s = summary.find((x) => x.ward === w);
            return (
              <button
                key={w}
                onClick={() => setWard(ward === w ? "" : w)}
                className={`rounded-lg border p-2 text-left text-xs ${ward === w ? "border-nnm-blue bg-blue-50" : "border-slate-200 bg-white"}`}
              >
                <div className="text-sm font-semibold text-slate-900">Ward {w}</div>
                <div className="text-amber-700">{s?.pending ?? 0} to review</div>
                <div className="text-green-700">{s?.approved ?? 0} approved</div>
                {(s?.returned ?? 0) > 0 && <div className="text-red-600">{s?.returned} returned</div>}
              </button>
            );
          })}
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          {(["pending", "returned", "approved", ""] as const).map((s) => (
            <button
              key={s || "all"}
              onClick={() => setStatus(s)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${status === s ? "bg-nnm-blue text-white" : "border border-slate-300 bg-white text-slate-700"}`}
            >
              {s === "" ? "All" : s === "pending" ? "To review" : KHATIAN_STATUS[s].label.split(" - ")[0]}
            </button>
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              load();
            }}
            className="ml-auto flex gap-2"
          >
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Sheet / part no."
              maxLength={20}
              className="w-40 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
            <button className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700">Search</button>
          </form>
        </div>

        {!rows ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Nothing here.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((k) => (
              <div key={k.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-[180px] font-semibold text-slate-900">
                    Ward {k.survey_ward} · Sheet {k.survey_sheet_no} · Part {k.part_no}
                    {k.version > 1 && <span className="ml-1 text-xs font-normal text-slate-400">v{k.version}</span>}
                  </div>
                  <div className="text-xs text-slate-500">
                    {k.uploaded_by_name}, {when(k.uploaded_at)} · {(Number(k.size_bytes) / 1048576).toFixed(1)} MB
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${KHATIAN_STATUS[k.status].tone}`}>{KHATIAN_STATUS[k.status].label.split(" - ")[0]}</span>
                  <div className="ml-auto flex flex-wrap gap-2">
                    <button onClick={() => open(k.id)} className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700">
                      <FileText className="h-3 w-3" />
                      Open PDF
                    </button>
                    {k.version > 1 && (
                      <button onClick={() => showHistory(k.id)} className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700">
                        <History className="h-3 w-3" />
                        Earlier versions
                      </button>
                    )}
                    {canReview && k.status === "pending" && (
                      <>
                        <button
                          onClick={() => {
                            setActing({ id: k.id, decision: "approve" });
                            setRemarks("");
                          }}
                          className="rounded-md bg-green-600 px-2 py-1 text-xs font-semibold text-white"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => {
                            setActing({ id: k.id, decision: "return" });
                            setRemarks("");
                          }}
                          className="rounded-md border border-red-300 px-2 py-1 text-xs font-semibold text-red-700"
                        >
                          Return
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {k.review_remarks && (
                  <div className="mt-1 text-xs text-slate-600">
                    {k.reviewed_by_name}: {k.review_remarks}
                  </div>
                )}
                {k.status === "approved" && !k.review_remarks && k.reviewed_by_name && (
                  <div className="mt-1 text-xs text-slate-500">
                    Approved by {k.reviewed_by_name}, {when(k.reviewed_at)}
                  </div>
                )}
                {acting?.id === k.id && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <input
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value)}
                      maxLength={500}
                      placeholder={acting.decision === "return" ? "What needs correcting (e.g. page 3 unreadable, wrong part no.)" : "Remarks (optional)"}
                      className="min-w-[260px] flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                      autoFocus
                    />
                    <button onClick={submit} disabled={saving} className="inline-flex items-center gap-1 rounded-md bg-nnm-blue px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
                      {saving && <Loader2 className="h-3 w-3 animate-spin" />}
                      {acting.decision === "approve" ? "Confirm approval" : "Return to Abhilekh Prabhari"}
                    </button>
                    <button onClick={() => setActing(null)} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700">
                      Cancel
                    </button>
                  </div>
                )}
                {history?.id === k.id && (
                  <table className="mt-3 w-full text-xs">
                    <tbody>
                      {history.versions.map((v) => (
                        <tr key={v.version} className="border-t border-slate-100">
                          <td className="py-1 pr-2 font-medium">v{v.version}</td>
                          <td className="py-1 pr-2 text-slate-500">
                            {v.uploaded_by_name}, {when(v.uploaded_at)}
                          </td>
                          <td className="py-1 pr-2">
                            {v.review_status ? `${KHATIAN_STATUS[v.review_status].label.split(" - ")[0]}${v.review_remarks ? `: ${v.review_remarks}` : ""}` : "Not reviewed"}
                          </td>
                          <td className="py-1 text-right">
                            <button onClick={() => open(k.id, v.version)} className="font-semibold text-nnm-blue hover:underline">
                              Open
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
