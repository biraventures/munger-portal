"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, BarChart3, Loader2, Printer } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { PROGRESS_REPORT_ROLES } from "@/components/admin/progress-report-card";
import { useAdminGuard } from "@/lib/use-admin-guard";
import { ADMIN_ROLE_LABELS, type AdminRole } from "@/lib/admin-auth";
import { fetchProgressReport, fetchReportableOfficers, type ProgressCategory, type ProgressReport } from "@/lib/progress-report-api";

const SUPERVISORS = ["commissioner", "deputy_commissioner", "city_manager"];
const input = "rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-nnm-blue focus:outline-none";
const TONE: Record<ProgressCategory, string> = {
  collection: "border-green-200 bg-green-50 text-green-800",
  holdings: "border-blue-200 bg-blue-50 text-blue-800",
  notices: "border-amber-200 bg-amber-50 text-amber-800",
  approvals: "border-violet-200 bg-violet-50 text-violet-800",
  other: "border-slate-200 bg-slate-50 text-slate-700",
};

/** India date (YYYY-MM-DD) of a Date. */
const ist = (d: Date) => new Date(d.getTime() + 5.5 * 3600000).toISOString().slice(0, 10);
function presets(): { key: string; label: string; from: string; to: string }[] {
  const now = new Date();
  const today = ist(now);
  const t = new Date(today + "T00:00:00Z");
  const add = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const dow = (t.getUTCDay() + 6) % 7; // Monday = 0
  const weekStart = add(t, -dow);
  const monthStart = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1));
  const lastMonthStart = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 1, 1));
  const lastMonthEnd = add(monthStart, -1);
  return [
    { key: "today", label: "Today", from: today, to: today },
    { key: "yesterday", label: "Yesterday", from: iso(add(t, -1)), to: iso(add(t, -1)) },
    { key: "week", label: "This week", from: iso(weekStart), to: today },
    { key: "lastweek", label: "Last week", from: iso(add(weekStart, -7)), to: iso(add(weekStart, -1)) },
    { key: "month", label: "This month", from: iso(monthStart), to: today },
    { key: "lastmonth", label: "Last month", from: iso(lastMonthStart), to: iso(lastMonthEnd) },
  ];
}
const dmy = (d: string) => d.split("-").reverse().join("/");
const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/**
 * Progress report: what an officer did in a period - collection made, changes to holdings, notices, approvals and other
 * work - with totals, a day-by-day count and every entry. Each officer sees their own; the Commissioner, DMC and City
 * Manager can choose any officer.
 */
export default function ProgressReportPage() {
  const admin = useAdminGuard();
  const ps = useMemo(presets, []);
  const [preset, setPreset] = useState("today");
  const [from, setFrom] = useState(ps[0]!.from);
  const [to, setTo] = useState(ps[0]!.to);
  const [user, setUser] = useState("");
  const [officers, setOfficers] = useState<{ username: string; display_name: string; role: string }[]>([]);
  const [data, setData] = useState<ProgressReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cat, setCat] = useState<ProgressCategory | "">("");

  const supervisor = !!admin && SUPERVISORS.includes(admin.role);

  async function load(f = from, t = to, u = user) {
    setBusy(true);
    setError(null);
    try {
      setData(await fetchProgressReport(f, t, u || undefined));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!admin || !PROGRESS_REPORT_ROLES.includes(admin.role)) return;
    load();
    if (SUPERVISORS.includes(admin.role))
      fetchReportableOfficers()
        .then(setOfficers)
        .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- first load only; later loads on Show / preset
  }, [admin]);

  if (!admin) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  if (!PROGRESS_REPORT_ROLES.includes(admin.role))
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <p className="mx-auto mt-10 max-w-xl rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Not available for your login.
        </p>
      </div>
    );

  const items = data ? (cat ? data.items.filter((i) => i.category === cat) : data.items) : [];
  const actions = data ? (cat ? data.byAction.filter((a) => a.category === cat) : data.byAction) : [];

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="print:hidden">
        <AdminHeader admin={admin} />
      </div>
      <main className="printable-flow mx-auto max-w-6xl space-y-5 px-4 py-8 sm:px-6 print:space-y-3 print:px-0 print:py-0">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
              <BarChart3 className="h-6 w-6" /> Progress Report
            </h1>
            {data && (
              <p className="text-sm text-slate-600">
                {data.officer.name} ({ADMIN_ROLE_LABELS[data.officer.role as AdminRole] ?? data.officer.role}) · {dmy(data.from)}
                {data.to !== data.from ? ` to ${dmy(data.to)}` : ""}
              </p>
            )}
          </div>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 print:hidden"
          >
            <Printer className="h-4 w-4" /> Print
          </button>
        </div>

        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 print:hidden">
          <div className="flex flex-wrap gap-2">
            {ps.map((p) => (
              <button
                key={p.key}
                onClick={() => {
                  setPreset(p.key);
                  setFrom(p.from);
                  setTo(p.to);
                  load(p.from, p.to);
                }}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold ${preset === p.key ? "bg-nnm-blue text-white" : "border border-slate-300 text-slate-700"}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="mb-1 block text-xs text-slate-500" htmlFor="pr-from">
                From
              </label>
              <input id="pr-from" type="date" value={from} onChange={(e) => (setFrom(e.target.value), setPreset(""))} className={input} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500" htmlFor="pr-to">
                To
              </label>
              <input id="pr-to" type="date" value={to} onChange={(e) => (setTo(e.target.value), setPreset(""))} className={input} />
            </div>
            {supervisor && (
              <div className="min-w-56">
                <label className="mb-1 block text-xs text-slate-500" htmlFor="pr-user">
                  Officer
                </label>
                <select id="pr-user" value={user} onChange={(e) => setUser(e.target.value)} className={`${input} w-full`}>
                  <option value="">Me ({admin.displayName})</option>
                  {officers
                    .filter((o) => o.username !== admin.username)
                    .map((o) => (
                      <option key={o.username} value={o.username}>
                        {o.display_name} - {ADMIN_ROLE_LABELS[o.role as AdminRole] ?? o.role}
                      </option>
                    ))}
                </select>
              </div>
            )}
            <button onClick={() => load()} className="rounded-md bg-nnm-blue px-4 py-2 text-sm font-semibold text-white">
              Show
            </button>
            {busy && <Loader2 className="h-5 w-5 animate-spin text-slate-400" />}
          </div>
        </section>

        {error && (
          <p role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </p>
        )}

        {data && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <button
                onClick={() => setCat("")}
                className={`rounded-lg border bg-white p-3 text-left ${cat === "" ? "ring-2 ring-nnm-blue/30" : ""} border-slate-200`}
              >
                <p className="text-xs text-slate-500">All work</p>
                <p className="text-xl font-semibold text-slate-900">{data.total.toLocaleString("en-IN")}</p>
              </button>
              {data.summary.map((s) => (
                <button
                  key={s.category}
                  onClick={() => setCat(cat === s.category ? "" : s.category)}
                  className={`rounded-lg border p-3 text-left ${TONE[s.category]} ${cat === s.category ? "ring-2 ring-nnm-blue/40" : ""}`}
                >
                  <p className="text-xs">{s.label}</p>
                  <p className="text-xl font-semibold">{s.count.toLocaleString("en-IN")}</p>
                  {s.category === "collection" && s.amount > 0 && <p className="text-sm font-semibold">{rupees(s.amount)}</p>}
                </button>
              ))}
            </div>

            {data.total === 0 ? (
              <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">
                Nothing recorded in this period.
              </p>
            ) : (
              <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
                <section className="rounded-xl border border-slate-200 bg-white p-4">
                  <h2 className="mb-2 text-sm font-semibold text-slate-800">
                    Work done{cat ? ` - ${data.summary.find((s) => s.category === cat)?.label}` : ""}
                  </h2>
                  {actions.length === 0 && <p className="py-4 text-center text-sm text-slate-400">Nothing in this section for the period.</p>}
                  <table className="w-full text-sm">
                    <tbody>
                      {actions.map((a) => (
                        <tr key={`${a.category}|${a.action}`} className="border-b border-slate-100">
                          <td className="py-1.5 pr-2">{a.action}</td>
                          <td className="py-1.5 text-right font-semibold">{a.count.toLocaleString("en-IN")}</td>
                          <td className="w-32 py-1.5 text-right text-green-700">
                            {a.category === "collection" && a.amount ? rupees(a.amount) : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
                <section className="rounded-xl border border-slate-200 bg-white p-4">
                  <h2 className="mb-2 text-sm font-semibold text-slate-800">Day by day</h2>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-slate-500">
                        <th className="pb-1">Date</th>
                        <th className="pb-1 text-right">Entries</th>
                        <th className="pb-1 text-right">Collected</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.days.map((d) => (
                        <tr key={d.date} className="border-b border-slate-100">
                          <td className="py-1">{dmy(d.date)}</td>
                          <td className="py-1 text-right">{d.count.toLocaleString("en-IN")}</td>
                          <td className="py-1 text-right text-green-700">{d.amount ? rupees(d.amount) : "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              </div>
            )}

            {items.length > 0 && (
              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <h2 className="mb-2 text-sm font-semibold text-slate-800">
                  Every entry ({items.length.toLocaleString("en-IN")}
                  {data.truncated ? ` shown of ${data.total.toLocaleString("en-IN")} - choose a shorter period to see all` : ""})
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs [&_td]:px-2 [&_td]:py-1.5 [&_th]:px-2">
                    <thead>
                      <tr className="border-b text-left text-slate-500">
                        <th>Date &amp; time</th>
                        <th>Work</th>
                        <th>Holding / no.</th>
                        <th className="text-right">Amount</th>
                        <th>Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((i, k) => (
                        <tr key={k} className="border-b border-slate-100 align-top">
                          <td className="whitespace-nowrap">{new Date(i.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</td>
                          <td>{i.action}</td>
                          <td className="whitespace-nowrap font-mono">{i.ref ?? "-"}</td>
                          <td className="text-right">{i.amount !== null && i.category === "collection" ? rupees(i.amount) : ""}</td>
                          <td className="text-slate-500">{i.detail ?? ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
