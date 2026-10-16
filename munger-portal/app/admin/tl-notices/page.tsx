"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Loader2, Printer } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { TlNoticePages } from "@/components/admin/tl-notice-sheet";
import { useAdminGuard } from "@/lib/use-admin-guard";
import { printElementInNewWindow } from "@/lib/print-in-new-window";
import {
  fetchTlNotice,
  fetchTlSurveys,
  licenseYearOptions,
  markTlComplied,
  openTlSurveyFile,
  readLicenceFile,
  TL_STATUS,
  validTillOptions,
  type FileUpload,
  type TlNotice,
  type TlSurvey,
} from "@/lib/tl-notice-api";

const ALLOWED = ["tax_collector", "city_manager", "deputy_commissioner", "commissioner", "trade_license_nodal"];
const FILTERS = [
  { value: "legal_action_due", label: "Legal action due" },
  { value: "notice_2", label: "2nd notice" },
  { value: "notice_1", label: "1st notice" },
  { value: "complied", label: "Licence obtained" },
  { value: "licensed", label: "Had licence" },
  { value: "", label: "All" },
];

function fmt(d: string | null): string {
  return d ? new Date(d).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }) : "-";
}

export default function TlNoticesPage() {
  const admin = useAdminGuard();
  const [filter, setFilter] = useState("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<TlSurvey[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [complyFor, setComplyFor] = useState<TlSurvey | null>(null);
  const [cYear, setCYear] = useState("");
  const [cTill, setCTill] = useState("");
  const [cNo, setCNo] = useState("");
  const [cFile, setCFile] = useState<FileUpload | null>(null);
  const [busy, setBusy] = useState(false);
  const [reprint, setReprint] = useState<TlNotice | null>(null);

  function load() {
    setRows(null);
    fetchTlSurveys({ status: filter || undefined, q: q.trim() || undefined })
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load."));
  }

  useEffect(() => {
    if (admin && ALLOWED.includes(admin.role)) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin, filter]);

  useEffect(() => {
    if (!reprint) return;
    const el = document.getElementById("tl-reprint");
    if (el) printElementInNewWindow(el);
    setReprint(null);
  }, [reprint]);

  if (!admin) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  if (!ALLOWED.includes(admin.role)) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <p className="p-10 text-sm text-slate-500">Not available for your login.</p>
      </div>
    );
  }
  const isTc = admin.role === "tax_collector";
  const canComply = isTc || admin.role === "city_manager";

  async function saveComplied() {
    if (!complyFor || !cFile) return;
    setBusy(true);
    setError(null);
    try {
      await markTlComplied(complyFor.id, { licenseYear: cYear, licenseValidTill: cTill, licenseNo: cNo.trim() || undefined, photo: cFile });
      setComplyFor(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  async function showFile(id: string, which: "license" | "complied") {
    try {
      await openTlSurveyFile(id, which);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open the file.");
    }
  }

  const counts = rows?.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {});

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">{isTc ? "My Trade Licence Visits" : "Trade Licence Notices"}</h1>
        <p className="mb-6 text-sm text-slate-500">
          Businesses checked by Tax Collectors. A 1st notice gives 14 days; if the licence is not obtained, a 2nd notice gives another 14 days, after
          which the business is listed for legal action. When the licence is produced, record it here with a copy.
        </p>

        {error && (
          <div role="alert" className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="mb-4 flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.label}
              onClick={() => setFilter(f.value)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${filter === f.value ? "bg-nnm-blue text-white" : "border border-slate-300 bg-white text-slate-700"}`}
            >
              {f.label}
              {filter === "" && f.value && counts?.[f.value] ? ` (${counts[f.value]})` : ""}
            </button>
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              load();
            }}
            className="ml-auto flex gap-2"
          >
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Holding / business / name" className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
            <button className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm">Search</button>
          </form>
        </div>

        {!rows ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Nothing here.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="p-2">Visited</th>
                  <th className="p-2">Holding</th>
                  <th className="p-2">Business / person</th>
                  <th className="p-2">Phone</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Notices</th>
                  {!isTc && <th className="p-2">Tax Collector</th>}
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100 align-top">
                    <td className="p-2 whitespace-nowrap">{fmt(r.recorded_at)}</td>
                    <td className="p-2">
                      {r.holding_no}
                      {r.ward && <span className="block text-xs text-slate-400">Ward {r.ward}</span>}
                      {r.is_nnm_shop && <span className="block text-xs font-semibold text-amber-700">NNM stall/shop{r.nnm_shop_no ? ` ${r.nnm_shop_no}` : ""}</span>}
                    </td>
                    <td className="p-2">
                      {r.business_name ?? <span className="text-slate-400">-</span>}
                      {r.person_name && <span className="block text-xs text-slate-500">{r.person_name}</span>}
                      {r.has_license && (
                        <span className="block text-xs text-slate-500">
                          Licence shown: {r.license_year}
                          {r.license_valid_till ? `, valid till ${r.license_valid_till}` : ""}
                          {r.license_no ? ` · ${r.license_no}` : ""}
                        </span>
                      )}
                    </td>
                    <td className="p-2">{r.phone ?? "-"}</td>
                    <td className="p-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TL_STATUS[r.status]?.tone}`}>{TL_STATUS[r.status]?.label ?? r.status}</span>
                      {r.status === "complied" && (
                        <span className="mt-1 block text-xs text-slate-500">
                          {r.complied_license_year}
                          {r.complied_valid_till ? ` (valid till ${r.complied_valid_till})` : ""}
                          {r.complied_license_no ? ` · ${r.complied_license_no}` : ""} — {r.complied_by}, {fmt(r.complied_at)}
                        </span>
                      )}
                    </td>
                    <td className="p-2 text-xs">
                      {(r.notices ?? []).map((n) => (
                        <button key={n.id} onClick={() => fetchTlNotice(n.id).then(setReprint).catch((e) => setError(e.message))} className="block text-left text-nnm-blue hover:underline" title="Print a copy">
                          <Printer className="mr-1 inline h-3 w-3" />
                          {n.noticeNo} · due {fmt(n.dueOn)}
                          {!n.printedAt && <span className="text-amber-700"> (not printed)</span>}
                        </button>
                      ))}
                    </td>
                    {!isTc && (
                      <td className="p-2 text-xs">
                        {r.recorded_by_name}
                        {r.recorded_by_code && <span className="block text-slate-400">{r.recorded_by_code}</span>}
                      </td>
                    )}
                    <td className="p-2 text-xs whitespace-nowrap">
                      {r.has_license_photo && (
                        <button onClick={() => showFile(r.id, "license")} className="block text-nnm-blue hover:underline">
                          Licence copy
                        </button>
                      )}
                      {r.has_complied_photo && (
                        <button onClick={() => showFile(r.id, "complied")} className="block text-nnm-blue hover:underline">
                          New licence copy
                        </button>
                      )}
                      {canComply && ["notice_1", "notice_2", "legal_action_due"].includes(r.status) && (
                        <button
                          onClick={() => {
                            setComplyFor(r);
                            setCYear(r.financial_year);
                            setCTill(r.financial_year);
                            setCNo("");
                            setCFile(null);
                          }}
                          className="mt-1 rounded-md border border-green-600 px-2 py-1 font-semibold text-green-700"
                        >
                          Licence obtained
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {complyFor && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md space-y-3 rounded-xl bg-white p-5 text-sm">
              <h2 className="text-lg font-semibold">Licence obtained — {complyFor.business_name}</h2>
              <p className="text-slate-500">Holding {complyFor.holding_no}. The licence must be valid for {complyFor.financial_year}.</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs text-slate-600">
                  Licence year
                  <select value={cYear} onChange={(e) => setCYear(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm">
                    {licenseYearOptions().map((y) => (
                      <option key={y}>{y}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-slate-600">
                  Valid till
                  <select value={cTill} onChange={(e) => setCTill(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm">
                    {validTillOptions(cYear).map((y) => (
                      <option key={y}>{y}</option>
                    ))}
                  </select>
                </label>
                <input value={cNo} onChange={(e) => setCNo(e.target.value)} placeholder="Licence no. (optional)" maxLength={50} className="col-span-2 rounded-md border border-slate-300 px-2 py-2" />
              </div>
              <input
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try {
                    setCFile(await readLicenceFile(f));
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Could not read the file.");
                  }
                }}
              />
              <div className="flex justify-end gap-2">
                <button onClick={() => setComplyFor(null)} className="rounded-md border border-slate-300 px-3 py-1.5">
                  Cancel
                </button>
                <button onClick={saveComplied} disabled={busy || !cFile || cTill < complyFor.financial_year} className="inline-flex items-center gap-1 rounded-md bg-nnm-blue px-3 py-1.5 font-semibold text-white disabled:opacity-60">
                  {busy && <Loader2 className="h-3 w-3 animate-spin" />}
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        {reprint && (
          <div className="hidden">
            <div id="tl-reprint">
              <TlNoticePages sheets={[{ key: reprint.id, n: reprint }]} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
