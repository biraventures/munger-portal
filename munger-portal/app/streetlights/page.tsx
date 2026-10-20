"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Lightbulb, Loader2, LogOut, XCircle } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import {
  clearSession,
  fetchMyReports,
  fetchSegmentLights,
  fetchWard,
  fetchWards,
  openSession,
  reportFault,
  savedSession,
  type LightRow,
  type MyReport,
  type PublicLightSession,
  type StreetRow,
  type SwitchSeen,
  type WardRow,
} from "@/lib/public-streetlight-api";

const inputClass = "w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue";
const labelClass = "mb-1 block text-xs font-medium text-slate-600";
const cardClass = "rounded-xl border border-slate-200 bg-white";

const SWITCH_OPTIONS: { value: SwitchSeen; label: string }[] = [
  { value: "not_working", label: "Switch not OK / damaged" },
  { value: "working", label: "Switch OK" },
  { value: "automatic", label: "Automatic (timer / sensor)" },
  { value: "joint", label: "Joint (shared switch)" },
  { value: "unknown", label: "Don't know" },
];

function todayIst(): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}
const fmtDate = (v: string | null) => (v ? new Date(v).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" }) : "-");
const wardLabel = (name: string) => (/^\s*ward/i.test(name) ? name : `Ward ${name}`);

type Filter = "" | "streetlight" | "high_mast";

/** One light: status, and for a working one the "Report not working" form. */
function LightItem({ light, title, subtitle, onReported }: { light: LightRow; title: string; subtitle?: string; onReported: (msg: string) => void }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayIst());
  const [sw, setSw] = useState<SwitchSeen | "">("");
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    if (!date) return setErr("Enter the date it stopped working.");
    if (!sw) return setErr("Choose the switch status.");
    setBusy(true);
    try {
      await reportFault({ lightId: light.lightId, nonFunctionalSince: date, switchStatus: sw, remarks: remarks.trim() || null });
      setOpen(false);
      onReported(`Thank you - ${title} is reported as not working and has been sent to the contractor for repair.`);
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
          <p className="font-mono text-sm font-semibold text-slate-900">{title}</p>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
        {light.working ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
            <CheckCircle2 className="h-3.5 w-3.5" /> Working
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
            <XCircle className="h-3.5 w-3.5" /> Not working{light.reportedOn ? ` - reported ${fmtDate(light.reportedOn)}` : ""}
          </span>
        )}
        {light.working && !open && (
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
              <label className={labelClass}>Switch status</label>
              <select value={sw} onChange={(e) => setSw(e.target.value as SwitchSeen)} className={inputClass}>
                <option value="">Select</option>
                {SWITCH_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className={labelClass}>Remarks (optional) - e.g. lamp broken, wire hanging, flickering</label>
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

function Street({ street, onReported }: { street: StreetRow; onReported: (msg: string) => void }) {
  const [open, setOpen] = useState(false);
  const [lights, setLights] = useState<LightRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = () =>
    fetchSegmentLights(street.segmentId)
      .then(setLights)
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not load the lights."));
  return (
    <div className="border-b border-slate-100 last:border-0">
      <button
        onClick={() => {
          setOpen(!open);
          if (!lights) load();
        }}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
      >
        {open ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
        <span className="flex-1 text-sm font-medium text-slate-800">
          {street.startPoint ?? "Street"}
          {street.endPoint ? ` → ${street.endPoint}` : ""}
        </span>
        <span className="text-xs text-slate-500">
          {street.totalLights} lights · <span className="text-green-700">{street.working} working</span>
          {street.notWorking > 0 && <span className="text-red-600"> · {street.notWorking} not working</span>}
        </span>
      </button>
      {open && (
        <div className="bg-slate-50/60">
          {err && <p className="px-4 py-2 text-xs text-red-600">{err}</p>}
          {!lights && !err && <p className="px-4 py-2 text-xs text-slate-400">Loading…</p>}
          {lights?.length === 0 && <p className="px-4 py-2 text-xs text-slate-400">No lights on this street.</p>}
          {lights?.map((l) => (
            <LightItem
              key={l.lightId}
              light={l}
              title={l.serialNumber}
              onReported={(m) => {
                onReported(m);
                load();
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function PublicStreetlightPage() {
  const [session, setSession] = useState<PublicLightSession | null>(null);
  const [holdingNo, setHoldingNo] = useState("");
  const [mobile, setMobile] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("");
  const [wards, setWards] = useState<WardRow[] | null>(null);
  const [openWard, setOpenWard] = useState<WardRow | null>(null);
  const [wardData, setWardData] = useState<{ streets: StreetRow[]; highMasts: LightRow[] } | null>(null);
  const [tab, setTab] = useState<"lights" | "mine">("lights");
  const [mine, setMine] = useState<MyReport[] | null>(null);

  useEffect(() => {
    setSession(savedSession());
  }, []);

  const handleError = (e: unknown) => {
    const err = e as Error & { status?: number };
    if (err.status === 401) setSession(null);
    setError(err.message || "Something went wrong.");
  };

  function loadWards(openHome = false) {
    setWards(null);
    fetchWards(filter || undefined)
      .then((w) => {
        setWards(w);
        if (openHome && session?.homeWardId) {
          const home = w.find((x) => Number(x.wardId) === session.homeWardId);
          if (home) openWardView(home);
        }
      })
      .catch(handleError);
  }

  useEffect(() => {
    if (!session) return;
    loadWards(!openWard);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, filter]);

  function openWardView(w: WardRow) {
    setOpenWard(w);
    setWardData(null);
    fetchWard(Number(w.wardId)).then(setWardData).catch(handleError);
  }

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
    if (openWard) fetchWard(Number(openWard.wardId)).then(setWardData).catch(() => undefined);
    fetchWards(filter || undefined).then(setWards).catch(() => undefined);
  }

  return (
    <div>
      <SiteHeader />
      <main>
        <section className="bg-gradient-to-br from-nnm-blue to-nnm-blue-dark py-12 text-white">
          <div className="mx-auto max-w-6xl px-6">
            <span className="mb-2.5 block font-mono text-[12.5px] uppercase tracking-[0.14em] text-nnm-gold">Streetlights</span>
            <h1 className="mb-3 flex items-center gap-2 font-display text-3xl font-semibold sm:text-4xl">
              <Lightbulb className="h-8 w-8" /> Report a Faulty Streetlight / High Mast
            </h1>
            <p className="max-w-2xl text-[17px] text-white/80">
              See which streetlights and High Mast lights in your ward are working, and report the ones that are not. Your report goes to the
              ward&apos;s maintenance contractor for repair within 72 hours.{" "}
              <Link href="/submersibles" className="font-semibold text-nnm-gold underline">
                Report a faulty submersible instead
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
                      ["lights", "Lights in the city"],
                      ["mine", "My reports"],
                    ] as const
                  ).map(([v, l]) => (
                    <button
                      key={v}
                      onClick={() => {
                        setTab(v);
                        setNotice(null);
                        if (v === "mine") fetchMyReports().then(setMine).catch(handleError);
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
                      <p className="p-4 text-sm text-slate-500">You have not reported any light yet.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase text-slate-500">
                              <th className="px-4 py-2">Light</th>
                              <th className="px-4 py-2">Ward</th>
                              <th className="px-4 py-2">Reported</th>
                              <th className="px-4 py-2">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {mine.map((r) => (
                              <tr key={r.id} className="border-b border-slate-50 last:border-0">
                                <td className="px-4 py-2">
                                  <span className="font-mono text-xs">{r.serial_number}</span>
                                  <span className="block text-xs text-slate-500">
                                    {r.light_type === "high_mast" ? "High Mast" : "Streetlight"}
                                    {r.locality_name ? ` · ${r.locality_name}` : ""}
                                  </span>
                                </td>
                                <td className="px-4 py-2 text-xs">{wardLabel(r.ward_name)}</td>
                                <td className="px-4 py-2 text-xs">{fmtDate(r.reported_at)}</td>
                                <td className="px-4 py-2 text-xs">
                                  {r.status === "repaired" ? (
                                    <span className="font-semibold text-green-700">Repaired {fmtDate(r.repaired_at)}</span>
                                  ) : (
                                    <span className="font-semibold text-amber-700">With the contractor</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium text-slate-500">Show:</span>
                      {(
                        [
                          ["", "All lights"],
                          ["streetlight", "Streetlights"],
                          ["high_mast", "High Mast"],
                        ] as const
                      ).map(([v, l]) => (
                        <button
                          key={v}
                          onClick={() => setFilter(v)}
                          className={`rounded-md px-3 py-1.5 text-xs font-semibold ${filter === v ? "bg-nnm-blue text-white" : "border border-slate-200 bg-white text-slate-600"}`}
                        >
                          {l}
                        </button>
                      ))}
                    </div>

                    {!openWard ? (
                      <div className={cardClass}>
                        {!wards ? (
                          <p className="p-4 text-sm text-slate-400">Loading…</p>
                        ) : (
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase text-slate-500">
                                <th className="px-4 py-2.5"></th>
                                <th className="px-4 py-2.5">Ward</th>
                                <th className="px-4 py-2.5">Lights</th>
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
                                    {Number(w.wardId) === session.homeWardId && <span className="ml-2 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-nnm-blue">your ward</span>}
                                  </td>
                                  <td className="px-4 py-2.5">
                                    {w.totalLights}
                                    {filter === "" && w.highMast ? <span className="text-xs text-slate-500"> (incl. {w.highMast} High Mast)</span> : null}
                                  </td>
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
                        <h2 className="text-lg font-semibold text-slate-900">{wardLabel(openWard.wardName)}</h2>
                        {!wardData ? (
                          <p className="text-sm text-slate-400">Loading…</p>
                        ) : (
                          <>
                            {filter !== "high_mast" && (
                              <div className={cardClass}>
                                <p className="border-b border-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-800">Streets - open a street to see its lights</p>
                                {wardData.streets.length === 0 ? (
                                  <p className="px-4 py-3 text-sm text-slate-400">No streetlights recorded in this ward yet.</p>
                                ) : (
                                  wardData.streets.map((s) => <Street key={s.segmentId} street={s} onReported={reported} />)
                                )}
                              </div>
                            )}
                            {filter !== "streetlight" && (
                              <div className={cardClass}>
                                <p className="border-b border-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-800">High Mast lights</p>
                                {wardData.highMasts.length === 0 ? (
                                  <p className="px-4 py-3 text-sm text-slate-400">No High Mast lights in this ward.</p>
                                ) : (
                                  wardData.highMasts.map((l) => (
                                    <LightItem
                                      key={l.lightId}
                                      light={l}
                                      title={l.localityName || l.serialNumber}
                                      subtitle={`High Mast ${l.serialNumber}${l.noOfLights ? ` · ${l.noOfLights} lamps` : ""}`}
                                      onReported={reported}
                                    />
                                  ))
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </>
                    )}
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
