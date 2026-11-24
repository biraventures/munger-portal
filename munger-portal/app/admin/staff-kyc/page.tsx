"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronLeft, Eye, FileCheck2, Loader2, Lock, Search, Upload } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import {
  DOC_SHORT,
  EVENT_LABEL,
  fetchKyc,
  fetchKycList,
  fmtAadhaar,
  KYC_STATUS,
  openKycDoc,
  reviewKyc,
  saveKycNumbers,
  submitKyc,
  uploadKycDoc,
  kycImageUrl,
  type KycDetail,
  type KycDoc,
  type KycListRow,
  type KycStatus,
} from "@/lib/staff-kyc-api";

const VIEW_ALL = ["commissioner", "deputy_commissioner", "city_manager", "tax_daroga"];
const KYC_ROLES = ["tax_collector", "agency_team_leader", "agency_project_manager", "agency_operator"];
const inputClass = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-nnm-blue";
const fmt = (v: string | null) =>
  v
    ? new Date(v).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "-";

function StatusPill({ status }: { status: KycStatus }) {
  const s = KYC_STATUS[status];
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${s.tone}`}>{s.label}</span>;
}

/**
 * Staff identity documents (KYC). Tax Daroga: enters Aadhaar / PAN and uploads the documents of every Tax Collector,
 * Team Leader, Project Manager and Agency Operator, then sends them for review. City Manager and DMC: each approves
 * or sends back; when both approve the login is active. Commissioner: views. Each staff member: views own.
 */
export default function StaffKycPage() {
  const admin = useAdminGuard();
  const [rows, setRows] = useState<KycListRow[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<KycStatus | "">("");
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  const viewAll = !!admin && VIEW_ALL.includes(admin.role);
  const isStaff = !!admin && KYC_ROLES.includes(admin.role);

  const loadList = useCallback(() => {
    fetchKycList()
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load."));
  }, []);

  useEffect(() => {
    if (viewAll) loadList();
  }, [viewAll, loadList]);

  const counts = useMemo(
    () => (rows ?? []).reduce<Record<string, number>>((a, r) => ({ ...a, [r.status]: (a[r.status] ?? 0) + 1 }), {}),
    [rows],
  );
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (rows ?? []).filter(
      (r) => (!filter || r.status === filter) && (!t || r.displayName.toLowerCase().includes(t) || r.username.toLowerCase().includes(t)),
    );
  }, [rows, filter, q]);

  if (!admin) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;

  // A reviewer's own desk first.
  const waitingOnMe = (r: KycListRow) =>
    r.status === "submitted" &&
    ((admin.role === "city_manager" && !r.cmReviewedAt) || (admin.role === "deputy_commissioner" && !r.dmcReviewedAt));
  const tdTodo = (r: KycListRow) => admin.role === "tax_daroga" && r.loginActive && ["not_started", "draft", "returned"].includes(r.status);

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">{isStaff ? "My Identity Documents" : "Collection Staff Documents"}</h1>
        <p className="mb-6 text-sm text-slate-500">
          Passport photograph, Aadhaar, PAN, appointment letter, ID card and police verification of every Tax Collector, Team Leader, Project Manager and Agency
          Operator. The Tax Daroga uploads them; the City Manager and the DMC review. The login becomes active for collection when both
          approve. Police verification certificate is optional for activation. Approved documents cannot be changed.
        </p>

        {error && (
          <div role="alert" className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        {isStaff ? (
          <KycPanel who="me" viewerRole={admin.role} onChanged={() => undefined} />
        ) : !viewAll ? (
          <p className="text-sm text-slate-500">This page is for the Tax Daroga, City Manager, DMC and Municipal Commissioner.</p>
        ) : open ? (
          <>
            <button
              onClick={() => {
                setOpen(null);
                loadList();
              }}
              className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-nnm-blue hover:underline"
            >
              <ChevronLeft className="h-4 w-4" /> All staff
            </button>
            <KycPanel who={open} viewerRole={admin.role} onChanged={loadList} />
          </>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {(["", "not_started", "draft", "returned", "submitted", "approved"] as const).map((s) => (
                <button
                  key={s || "all"}
                  onClick={() => setFilter(s)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${filter === s ? "border-nnm-blue bg-nnm-blue text-white" : "border-slate-300 bg-white text-slate-700"}`}
                >
                  {s ? KYC_STATUS[s].label : "All"} ({s ? (counts[s] ?? 0) : (rows?.length ?? 0)})
                </button>
              ))}
              <div className="relative ml-auto w-full sm:w-64">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search name / username"
                  className={`${inputClass} pl-8`}
                />
              </div>
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              {!rows ? (
                <p className="p-4 text-sm text-slate-400">Loading…</p>
              ) : shown.length === 0 ? (
                <p className="p-4 text-sm text-slate-500">No staff here.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase text-slate-500">
                      <th className="px-4 py-2.5">Staff</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5">Aadhaar / PAN</th>
                      <th className="px-4 py-2.5">Documents</th>
                      <th className="px-4 py-2.5">City Manager</th>
                      <th className="px-4 py-2.5">DMC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...shown]
                      .sort((a, b) => Number(waitingOnMe(b) || tdTodo(b)) - Number(waitingOnMe(a) || tdTodo(a)))
                      .map((r) => (
                        <tr
                          key={r.username}
                          onClick={() => setOpen(r.username)}
                          className={`cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50 ${waitingOnMe(r) ? "bg-amber-50/60" : ""}`}
                        >
                          <td className="px-4 py-2.5">
                            <span className="font-semibold text-slate-800">{r.displayName}</span>
                            <span className="block text-xs text-slate-500">
                              {r.roleLabel} · {r.username}
                              {!r.loginActive && <span className="ml-1 text-red-600">(login switched off)</span>}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <StatusPill status={r.status} />
                            {waitingOnMe(r) && <span className="mt-1 block text-xs font-semibold text-amber-700">Waiting for you</span>}
                            {r.status === "returned" && r.returnedReason && (
                              <span className="mt-1 block max-w-[14rem] text-xs text-red-700">{r.returnedReason}</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-xs text-slate-600">
                            {r.aadhaarMasked ?? "-"}
                            <span className="block">{r.panMasked ?? "-"}</span>
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex max-w-[16rem] flex-wrap gap-1">
                              {(Object.keys(DOC_SHORT) as KycDoc[]).map((d) => (
                                <span
                                  key={d}
                                  className={`rounded px-1.5 py-0.5 text-[10px] ${r.docs[d] ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-400"}`}
                                >
                                  {DOC_SHORT[d]}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-xs">
                            {r.cmReviewedAt ? <span className="text-green-700">✓ {r.cmReviewedBy}</span> : "-"}
                          </td>
                          <td className="px-4 py-2.5 text-xs">
                            {r.dmcReviewedAt ? <span className="text-green-700">✓ {r.dmcReviewedBy}</span> : "-"}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function KycPanel({ who, viewerRole, onChanged }: { who: string | "me"; viewerRole: string; onChanged: () => void }) {
  const [k, setK] = useState<KycDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [aadhaar, setAadhaar] = useState("");
  const [pan, setPan] = useState("");
  const [remarks, setRemarks] = useState("");

  const load = useCallback(() => {
    fetchKyc(who)
      .then((d) => {
        setK(d);
        setAadhaar(d.aadhaarNo ?? "");
        setPan(d.panNo ?? "");
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not load."));
  }, [who]);
  useEffect(load, [load]);

  async function run(key: string, fn: () => Promise<unknown>, done: string) {
    setErr(null);
    setMsg(null);
    setBusy(key);
    try {
      await fn();
      setMsg(done);
      load();
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(null);
    }
  }

  if (!k) return err ? <p className="text-sm text-red-700">{err}</p> : <p className="text-sm text-slate-400">Loading…</p>;
  const user = who === "me" ? "me" : k.username;
  const canUpload = (d: KycDetail["docs"][number]) =>
    k.can.edit || (k.can.addPolice && !d.uploaded && (d.key === "photo" || d.key === "police_application" || d.key === "police_certificate"));
  const photoUploaded = k.docs.some((d) => d.key === "photo" && d.uploaded);
  const missing = [
    ...(!k.aadhaarNo ? ["Aadhaar number"] : []),
    ...(!k.panNo ? ["PAN"] : []),
    ...k.docs.filter((d) => d.required && !d.uploaded).map((d) => d.label),
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-4">
            <StaffPhoto who={user} uploaded={photoUploaded} version={k.events.length} />
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{k.displayName}</h2>
              <p className="text-sm text-slate-500">
                {k.roleLabel} · {k.username}
              </p>
            </div>
          </div>
          <div className="text-right">
            <StatusPill status={k.status} />
            <p className={`mt-1 text-xs font-medium ${k.activeForCollection ? "text-green-700" : "text-red-700"}`}>
              {k.activeForCollection ? "Active for collection" : k.enforcement ? "Not active - cannot log in" : "Not yet approved"}
            </p>
          </div>
        </div>
        {k.status === "returned" && k.returnedReason && (
          <p className="mt-3 rounded-md border border-red-200 bg-red-50 p-2.5 text-sm text-red-800">
            <b>Sent back:</b> {k.returnedReason}
          </p>
        )}
        {k.status === "approved" && (
          <p className="mt-3 flex items-center gap-1.5 rounded-md border border-green-200 bg-green-50 p-2.5 text-sm text-green-800">
            <Lock className="h-4 w-4" /> Approved on {fmt(k.approvedAt)} - these documents are locked and cannot be changed.
          </p>
        )}

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Aadhaar number</label>
            {k.can.edit ? (
              <input
                value={aadhaar}
                onChange={(e) => setAadhaar(e.target.value)}
                inputMode="numeric"
                maxLength={14}
                placeholder="12 digits"
                className={inputClass}
              />
            ) : (
              <p className="font-mono text-sm text-slate-800">{fmtAadhaar(k.aadhaarNo)}</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">PAN</label>
            {k.can.edit ? (
              <input
                value={pan}
                onChange={(e) => setPan(e.target.value.toUpperCase())}
                maxLength={10}
                placeholder="ABCDE1234F"
                className={inputClass}
              />
            ) : (
              <p className="font-mono text-sm text-slate-800">{k.panNo ?? "-"}</p>
            )}
          </div>
        </div>
        {k.can.edit && (
          <button
            onClick={() => run("numbers", () => saveKycNumbers(k.username, aadhaar, pan), "Aadhaar and PAN saved.")}
            disabled={busy !== null || !aadhaar.trim() || !pan.trim()}
            className="mt-3 rounded-md bg-nnm-blue px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            {busy === "numbers" ? "Saving…" : "Save Aadhaar & PAN"}
          </button>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <h3 className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-800">Documents</h3>
        {k.docs.map((d) => (
          <div key={d.key} className="flex flex-wrap items-center gap-3 border-b border-slate-50 px-5 py-3 last:border-0">
            {d.uploaded ? (
              <FileCheck2 className="h-5 w-5 text-green-600" />
            ) : (
              <span className="h-5 w-5 rounded-full border-2 border-dashed border-slate-300" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-800">{d.label}</p>
              <p className="text-xs text-slate-500">{d.required ? "Required" : "Optional for activation - can be added later"}</p>
            </div>
            {d.uploaded && (
              <button
                onClick={() => openKycDoc(user, d.key).catch((e) => setErr(e instanceof Error ? e.message : "Could not open."))}
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
              >
                <Eye className="h-3.5 w-3.5" /> View
              </button>
            )}
            {canUpload(d) && (
              <label className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-nnm-blue px-3 py-1.5 text-xs font-semibold text-white">
                {busy === d.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                {d.uploaded ? "Replace" : "Upload"}
                <input
                  type="file"
                  accept={d.key === "photo" ? "image/jpeg,image/png" : "image/jpeg,image/png,application/pdf"}
                  className="hidden"
                  disabled={busy !== null}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) run(d.key, () => uploadKycDoc(k.username, d.key, f), `${d.label} uploaded.`);
                  }}
                />
              </label>
            )}
          </div>
        ))}
        <p className="px-5 pb-3 pt-1 text-xs text-slate-400">Photo (JPG / PNG, reduced to 750 KB automatically) or PDF up to 2 MB.</p>
      </div>

      {(err || msg) && <p className={`text-sm ${err ? "text-red-700" : "text-green-700"}`}>{err ?? msg}</p>}

      {k.can.edit && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          {missing.length > 0 ? (
            <p className="text-sm text-slate-600">
              Still needed before sending for review: <b>{missing.join(", ")}</b>.
            </p>
          ) : (
            <p className="text-sm text-slate-600">
              Everything required is in. Check the documents, then send them to the City Manager and DMC.
            </p>
          )}
          <button
            onClick={() => run("submit", () => submitKyc(k.username), "Sent to the City Manager and DMC for review.")}
            disabled={busy !== null || missing.length > 0}
            className="mt-3 rounded-md bg-green-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            {busy === "submit" ? "Sending…" : "Send for review"}
          </button>
        </div>
      )}

      {(k.status === "submitted" || k.status === "approved") && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm">
          <h3 className="mb-2 font-semibold text-slate-800">Review</h3>
          <p>
            City Manager:{" "}
            {k.cmReviewedAt ? (
              <span className="text-green-700">
                <CheckCircle2 className="mr-0.5 inline h-3.5 w-3.5" /> approved by {k.cmReviewedBy} on {fmt(k.cmReviewedAt)}
              </span>
            ) : (
              <span className="text-amber-700">waiting</span>
            )}
          </p>
          <p>
            DMC:{" "}
            {k.dmcReviewedAt ? (
              <span className="text-green-700">
                <CheckCircle2 className="mr-0.5 inline h-3.5 w-3.5" /> approved by {k.dmcReviewedBy} on {fmt(k.dmcReviewedAt)}
              </span>
            ) : (
              <span className="text-amber-700">waiting</span>
            )}
          </p>
          {k.can.review && (
            <div className="mt-4 space-y-2">
              <p className="text-xs text-slate-500">
                Open each document and check it against the numbers and the person.{" "}
                {viewerRole === "city_manager" ? "The DMC" : "The City Manager"} also has to approve before the login is active.
              </p>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="Remarks (required when sending back)"
                className={inputClass}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() =>
                    run(
                      "approve",
                      () => reviewKyc(k.username, "approve", remarks.trim() || null),
                      "Approved. The login becomes active once both the City Manager and the DMC have approved.",
                    )
                  }
                  disabled={busy !== null}
                  className="rounded-md bg-green-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  onClick={() => run("return", () => reviewKyc(k.username, "return", remarks.trim()), "Sent back to the Tax Daroga.")}
                  disabled={busy !== null}
                  className="rounded-md border border-red-300 bg-white px-4 py-2 text-xs font-semibold text-red-700 disabled:opacity-50"
                >
                  Send back to Tax Daroga
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {k.events.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="mb-2 text-sm font-semibold text-slate-800">History</h3>
          <ul className="space-y-1 text-xs text-slate-600">
            {k.events.map((e, i) => (
              <li key={i}>
                <span className="text-slate-400">{fmt(e.at)}</span> - <b>{EVENT_LABEL(e.action)}</b> by {e.by_name ?? "-"}
                {e.remarks ? ` - ${e.remarks}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** The staff member's passport photograph (or an empty frame until it is uploaded). */
function StaffPhoto({ who, uploaded, version }: { who: string | "me"; uploaded: boolean; version: number }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!uploaded) return setUrl(null);
    let live = true;
    let made: string | null = null;
    kycImageUrl(who, "photo")
      .then((u) => {
        made = u;
        if (live) setUrl(u);
        else URL.revokeObjectURL(u);
      })
      .catch(() => live && setUrl(null));
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [who, uploaded, version]);
  return (
    <div className="flex h-24 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-50">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="Passport photograph" className="h-full w-full object-cover" />
      ) : (
        <span className="px-1 text-center text-[10px] text-slate-400">No photo</span>
      )}
    </div>
  );
}
