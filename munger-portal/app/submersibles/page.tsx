"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Droplet, Loader2, LogOut, XCircle } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import {
  clearSession,
  fetchMyPyauReports,
  fetchPyauWard,
  fetchPyauWards,
  openSession,
  PROBLEM_OPTIONS,
  reportPyauFault,
  savedSession,
  type MyPyauReport,
  type PublicLightSession,
  type PublicPyau,
  type PyauProblem,
  type PyauWardRow,
} from "@/lib/public-submersible-api";

const inputClass = "w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue";
const labelClass = "mb-1 block text-xs font-medium text-slate-600";
const cardClass = "rounded-xl border border-slate-200 bg-white";

function todayIst(): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}
const fmtDate = (v: string | null) => (v ? new Date(v).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" }) : "-");
const wardLabel = (name: string) => (/^\s*ward/i.test(name) ? name : `Ward ${name}`);
const problemLabel = (p: string | null) => PROBLEM_OPTIONS.find((o) => o.value === p)?.label ?? "-";

/** One submersible: status, and for a working one the "Report not working" form. */
function PyauItem({ pyau, onReported }: { pyau: PublicPyau; onReported: (msg: string) => void }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayIst());
  const [problem, setProblem] = useState<PyauProblem | "">("");
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    if (!date) return setErr("Enter the date it stopped working.");
    if (!problem) return setErr("Choose the problem you saw.");
    if (problem === "other" && !remarks.trim()) return setErr("Describe the problem in the remarks.");
    setBusy(true);
    try {
      await reportPyauFault({ pyauId: pyau.pyauId, nonFunctionalSince: date, problem, remarks: remarks.trim() || null });
      setOpen(false);
      onReported(`Thank you - submersible ${pyau.serialNumber} is reported as not working and has been sent for repair.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not send the report.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-b border-slate-100 px-4 py-3 last:border-0">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-sm font-semibold text-slate-900">{pyau.serialNumber}</p>
          <p className="text-xs text-slate-500">
            {pyau.location || "Location not recorded"}
            {pyau.schemeName ? ` · ${pyau.schemeName}` : ""}
          </p>
        </div>
        {pyau.working ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
            <CheckCircle2 className="h-3.5 w-3.5" /> Working
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
            <XCircle className="h-3.5 w-3.5" /> Not working{pyau.reportedOn ? ` - reported ${fmtDate(pyau.reportedOn)}` : " - recorded by Nagar Nigam"}
          </span>
        )}
        {pyau.working && !open && (
          <button onClick={() => setOpen(true)} className="rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700">
            Report not working
          </button>
        )}
      </div>
      {open && (
        <div className="mt-3 space-y-3 rounded-lg border border-red-200 bg-red-50/60 p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Not working since</label>
              <input type="date" value={date} max={todayIst()} onChange={(e) => setDate(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Problem</label>
              <select value={problem} onChange={(e) => setProblem(e.target.value as PyauProblem)} className={inputClass}>
                <option value="">Select</option>
                {PROBLEM_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className={labelClass}>Remarks{problem === "other" ? "" : " (optional)"} - e.g. water dirty, low pressure, motor burnt</label>
            <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} maxLength={500} className={inputClass} />
          </div>
          {err && <p className="text-xs font-medium text-red-700">{err}</p>}
          <div className="flex gap-2">
            <button onClick={submit} disabled={busy} className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60">
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Send report
            </button>
            <button onClick={() => setOpen(false)} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PublicSubmersiblePage() {
  const [session, setSession] = useState<PublicLightSession | null>(null);
  const [holdingNo, setHoldingNo] = useState("");
  const [mobile, setMobile] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [wards, setWards] = useState<PyauWardRow[] | null>(null);
  const [openWard, setOpenWard] = useState<PyauWardRow | null>(null);
  const [pyaus, setPyaus] = useState<PublicPyau[] | null>(null);
  const [tab, setTab] = useState<"list" | "mine">("list");
  const [mine, setMine] = useState<MyPyauReport[] | null>(null);
  const [onlyNotWorking, setOnlyNotWorking] = useState(false);

  useEffect(() => {
    setSession(savedSession());
  }, []);

  const handleError = (e: unknown) => {
    const err = e as Error & { status?: number };
    if (err.status === 401) setSession(null);
    setError(err.message || "Something went wrong.");
  };

  function openWardView(w: PyauWardRow) {
    setOpenWard(w);
    setPyaus(null);
    fetchPyauWard(w.wardId).then(setPyaus).catch(handleError);
  }

  useEffect(() => {
    if (!session) return;
    setWards(null);
    fetchPyauWards()
      .then((w) => {
        setWards(w);
        // Open the holding's own ward first, if it has submersibles.
        const home = session.homeWardId ? w.find((x) => x.wardId === session.homeWardId) : undefined;
        if (home) openWardView(home);
      })
      .catch(handleError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!holdingNo.trim() || !mobile.trim()) return setError("Enter your holding number and the mobile number registered on it.");
    setBusy(true);
    try {
      setSession(await openSession(holdingNo.trim(), mobile.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify.");
    } finally {
      setBusy(false);
    }
  }

  function reported(msg: string) {
    setNotice(msg);
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (openWard) fetchPyauWard(openWard.wardId).then(setPyaus).catch(() => undefined);
    fetchPyauWards().then(setWards).catch(() => undefined);
  }

  const shown = pyaus?.filter((p) => !onlyNotWorking || !p.working) ?? null;

  return (
    <div>
      <SiteHeader />
      <main>
        <section className="bg-gradient-to-br from-nnm-blue to-nnm-blue-dark py-12 text-white">
          <div className="mx-auto max-w-6xl px-6">
            <span className="mb-2.5 block font-mono text-[12.5px] uppercase tracking-[0.14em] text-nnm-gold">Water Supply</span>
            <h1 className="mb-3 flex items-center gap-2 font-display text-3xl font-semibold sm:text-4xl">
              <Droplet className="h-8 w-8" /> Report a Faulty Submersible
            </h1>
            <p className="max-w-2xl text-[17px] text-white/80">
              See which submersibles (pyau / water points) in your ward are working, and report the ones that are not. Your report goes to the
              ward&apos;s maintenance contractor for repair.{" "}
              <Link href="/streetlights" className="font-semibold text-nnm-gold underline">
                Report a faulty streetlight instead
              </Link>
            </p>
          </div>
        </section>

        <section className="bg-paper-dim py-10">
          <div className="mx-auto max-w-4xl space-y-5 px-4 sm:px-6">
            {error && (
              <div role="alert" className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
            {notice && (
              <div className="flex items-start gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                {notice}
              </div>
            )}

            {!session ? (
              <form onSubmit={verify} className={`${cardClass} space-y-4 p-6`}>
                <p className="text-sm text-slate-700">Enter your holding number and the mobile number registered on that holding.</p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>Holding number</label>
                    <input value={holdingNo} onChange={(e) => setHoldingNo(e.target.value)} maxLength={32} placeholder="e.g. MUNG-02002" className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Mobile number</label>
                    <input value={mobile} onChange={(e) => setMobile(e.target.value)} inputMode="tel" maxLength={20} placeholder="10-digit mobile" className={inputClass} />
                  </div>
                </div>
                <button disabled={busy} className="inline-flex items-center gap-2 rounded-md bg-nnm-blue px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  Continue
                </button>
              </form>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  {(
                    [
                      ["list", "Submersibles in the city"],
                      ["mine", "My reports"],
                    ] as const
                  ).map(([v, l]) => (
                    <button
                      key={v}
                      onClick={() => {
                        setTab(v);
                        setNotice(null);
                        if (v === "mine") fetchMyPyauReports().then(setMine).catch(handleError);
                      }}
                      className={`rounded-md px-3 py-1.5 text-sm font-semibold ${tab === v ? "bg-nnm-blue text-white" : "border border-slate-300 bg-white text-slate-700"}`}
                    >
                      {l}
                    </button>
                  ))}
                  <span className="ml-auto text-xs text-slate-500">Holding {session.holdingNo}</span>
                  <button
                    onClick={() => {
                      clearSession();
                      setSession(null);
                      setWards(null);
                      setOpenWard(null);
                    }}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:underline"
                  >
                    <LogOut className="h-3.5 w-3.5" /> Exit
                  </button>
                </div>

                {tab === "mine" ? (
                  <div className={cardClass}>
                    {!mine ? (
                      <p className="p-4 text-sm text-slate-400">Loading…</p>
                    ) : mine.length === 0 ? (
                      <p className="p-4 text-sm text-slate-500">You have not reported any submersible yet.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase text-slate-500">
                              <th className="px-4 py-2">Submersible</th>
                              <th className="px-4 py-2">Ward</th>
                              <th className="px-4 py-2">Reported</th>
                              <th className="px-4 py-2">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {mine.map((r) => (
                              <tr key={r.id} className="border-b border-slate-50 last:border-0">
                                <td className="px-4 py-2">
                                  <span className="font-mono text-xs">{r.serial_number ?? "-"}</span>
                                  <span className="block text-xs text-slate-500">
                                    {problemLabel(r.reported_problem)}
                                    {r.location_address ? ` · ${r.location_address}` : ""}
                                  </span>
                                </td>
                                <td className="px-4 py-2 text-xs">{wardLabel(r.ward_name)}</td>
                                <td className="px-4 py-2 text-xs">{fmtDate(r.reported_at)}</td>
                                <td className="px-4 py-2 text-xs">
                                  {r.status === "repaired" ? (
                                    <span className="font-semibold text-green-700">Repaired {fmtDate(r.date_of_repair)}</span>
                                  ) : (
                                    <span className="font-semibold text-amber-700">Sent for repair</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ) : !openWard ? (
                  <div className={cardClass}>
                    {!wards ? (
                      <p className="p-4 text-sm text-slate-400">Loading…</p>
                    ) : wards.length === 0 ? (
                      <p className="p-4 text-sm text-slate-500">No submersibles are recorded yet.</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase text-slate-500">
                            <th className="px-4 py-2.5"></th>
                            <th className="px-4 py-2.5">Ward</th>
                            <th className="px-4 py-2.5">Submersibles</th>
                            <th className="px-4 py-2.5">Working</th>
                            <th className="px-4 py-2.5">Not working</th>
                          </tr>
                        </thead>
                        <tbody>
                          {wards.map((w) => (
                            <tr key={w.wardId} onClick={() => openWardView(w)} className="cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50">
                              <td className="px-4 py-2.5 text-slate-400">
                                <ChevronRight className="h-4 w-4" />
                              </td>
                              <td className="px-4 py-2.5 font-semibold text-slate-800">
                                {wardLabel(w.wardName)}
                                {w.wardId === session.homeWardId && <span className="ml-2 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-nnm-blue">your ward</span>}
                              </td>
                              <td className="px-4 py-2.5">{w.total}</td>
                              <td className="px-4 py-2.5 text-green-700">{w.working}</td>
                              <td className="px-4 py-2.5">{w.notWorking > 0 ? <span className="font-semibold text-red-600">{w.notWorking}</span> : 0}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        setOpenWard(null);
                        setNotice(null);
                      }}
                      className="inline-flex items-center gap-1 text-sm font-semibold text-nnm-blue hover:underline"
                    >
                      <ChevronLeft className="h-4 w-4" /> All wards
                    </button>
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="text-lg font-semibold text-slate-900">{wardLabel(openWard.wardName)}</h2>
                      <label className="ml-auto inline-flex items-center gap-1.5 text-xs text-slate-600">
                        <input type="checkbox" checked={onlyNotWorking} onChange={(e) => setOnlyNotWorking(e.target.checked)} />
                        Show only not working
                      </label>
                    </div>
                    <div className={cardClass}>
                      {!shown ? (
                        <p className="px-4 py-3 text-sm text-slate-400">Loading…</p>
                      ) : shown.length === 0 ? (
                        <p className="px-4 py-3 text-sm text-slate-400">{onlyNotWorking ? "All submersibles in this ward are working." : "No submersibles in this ward."}</p>
                      ) : (
                        shown.map((p) => <PyauItem key={p.pyauId} pyau={p} onReported={reported} />)
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
