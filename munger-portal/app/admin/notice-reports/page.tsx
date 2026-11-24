"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Download, Image as ImageIcon, Loader2 } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import { openTlReceivingCopy } from "@/lib/tl-notice-api";
import {
  NOTICE_REPORT_ROLES,
  downloadNoticeReport,
  fetchNoticeReport,
  fetchNoticeReportFilters,
  openReceivingCopy,
  type Breakdown,
  type NoticeReport,
  type NoticeReportFilters,
} from "@/lib/notice-report-api";

type Tab = "served" | "tlNotices" | "tlApplications";
const TABS: { id: Tab; label: string }[] = [
  { id: "served", label: "Demand notices served" },
  { id: "tlNotices", label: "Trade licence notices issued" },
  { id: "tlApplications", label: "Trade licence applications received" },
];

const istToday = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
const shift = (d: string, days: number) => new Date(Date.parse(d) + days * 86400000).toISOString().slice(0, 10);
const dayText = (d: string) => d.split("-").reverse().join("-");
const money = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const when = (v: unknown, time = false) => {
  if (!v) return "-";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(time ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
};

const input = "rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-nnm-blue";
const btn =
  "inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50";

function Kpi({
  label,
  value,
  sub,
  active,
  onClick,
}: {
  label: string;
  value: string;
  sub?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border bg-white p-4 text-left ${active ? "border-nnm-blue ring-2 ring-nnm-blue/30" : "border-slate-200"}`}
    >
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
    </button>
  );
}

function Table({ title, head, children, note }: { title: string; head: string[]; children: React.ReactNode; note?: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-800">
        {title}
        {note && <span className="ml-2 text-xs font-normal text-slate-500">{note}</span>}
      </div>
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs text-slate-500">
          <tr>
            {head.map((h, i) => (
              <th key={h + i} className={`whitespace-nowrap px-3 py-2 ${i > 0 ? "text-right" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
const Empty = ({ cols }: { cols: number }) => (
  <tr>
    <td colSpan={cols} className="px-3 py-6 text-center text-sm text-slate-400">
      Nothing in this period.
    </td>
  </tr>
);

/** Ward-wise, collector-wise, day-wise and the collector x day table for one dataset. */
function Breakdowns({ b, extraWard, showAmount }: { b: Breakdown; extraWard?: string; showAmount?: boolean }) {
  const days = useMemo(() => [...new Set(b.byDay.map((d) => d.day))].sort(), [b]);
  const cell = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of b.byCollectorDay) m.set(`${x.username ?? ""}|${x.day}`, x.count);
    return m;
  }, [b]);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Table title="Ward-wise" head={["Ward", "Count", ...(showAmount ? ["Amount"] : []), ...(extraWard ? [extraWard] : [])]}>
          {b.byWard.length === 0 ? (
            <Empty cols={4} />
          ) : (
            b.byWard.map((w) => (
              <tr key={w.ward} className="border-t border-slate-100">
                <td className="px-3 py-1.5">{w.ward === "(no ward)" ? "No ward" : `Ward ${w.ward}`}</td>
                <td className="px-3 py-1.5 text-right font-medium">{w.count}</td>
                {showAmount && <td className="px-3 py-1.5 text-right">{money(w.amount)}</td>}
                {extraWard && <td className="px-3 py-1.5 text-right text-slate-500">{w.extra}</td>}
              </tr>
            ))
          )}
        </Table>
        <Table title="Tax Collector-wise" head={["Tax Collector", "Count"]}>
          {b.byCollector.length === 0 ? (
            <Empty cols={2} />
          ) : (
            b.byCollector.map((c) => (
              <tr key={c.username ?? "none"} className="border-t border-slate-100">
                <td className="px-3 py-1.5">{c.name}</td>
                <td className="px-3 py-1.5 text-right font-medium">{c.count}</td>
              </tr>
            ))
          )}
        </Table>
        <Table title="Day-wise" head={["Date", "Count", ...(showAmount ? ["Amount"] : [])]}>
          {b.byDay.length === 0 ? (
            <Empty cols={3} />
          ) : (
            b.byDay.map((d) => (
              <tr key={d.day} className="border-t border-slate-100">
                <td className="px-3 py-1.5">{dayText(d.day)}</td>
                <td className="px-3 py-1.5 text-right font-medium">{d.count}</td>
                {showAmount && <td className="px-3 py-1.5 text-right">{money(d.amount)}</td>}
              </tr>
            ))
          )}
        </Table>
      </div>
      {days.length > 1 && days.length <= 31 && b.byCollector.length > 0 && (
        <Table
          title="Tax Collector - day by day"
          head={["Tax Collector", ...days.map((d) => d.slice(8, 10) + "/" + d.slice(5, 7)), "Total"]}
        >
          {b.byCollector.map((c) => (
            <tr key={c.username ?? "none"} className="border-t border-slate-100">
              <td className="whitespace-nowrap px-3 py-1.5">{c.name}</td>
              {days.map((d) => {
                const n = cell.get(`${c.username ?? ""}|${d}`) ?? 0;
                return (
                  <td key={d} className={`px-2 py-1.5 text-right ${n ? "font-medium text-slate-900" : "text-slate-300"}`}>
                    {n || "·"}
                  </td>
                );
              })}
              <td className="px-3 py-1.5 text-right font-semibold">{c.count}</td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

export default function NoticeReportsPage() {
  const admin = useAdminGuard();
  const today = istToday();
  const [f, setF] = useState<NoticeReportFilters>({ from: today, to: today });
  const [wards, setWards] = useState<string[]>([]);
  const [collectors, setCollectors] = useState<{ username: string; name: string; code: string | null }[]>([]);
  const [report, setReport] = useState<NoticeReport | null>(null);
  const [tab, setTab] = useState<Tab>("served");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const allowed = !!admin && NOTICE_REPORT_ROLES.includes(admin.role);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await fetchNoticeReport(f));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the report.");
    } finally {
      setLoading(false);
    }
  }, [f]);

  useEffect(() => {
    if (!allowed) return;
    fetchNoticeReportFilters()
      .then((r) => {
        setWards(r.wards);
        setCollectors(r.collectors);
      })
      .catch(() => {});
  }, [allowed]);
  useEffect(() => {
    if (allowed) load();
  }, [allowed, load]);

  if (!admin) return null;
  if (!allowed)
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <main className="mx-auto max-w-3xl px-4 py-10 text-sm text-slate-600">
          This report is for the agency Team Leader / Project Manager and officers.
        </main>
      </div>
    );

  const preset = (from: string, to: string) => setF((x) => ({ ...x, from, to }));
  const b = report?.[tab];
  const single = f.from === f.to;

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />
      <main className="mx-auto max-w-7xl space-y-5 px-4 py-8 sm:px-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Notices report</h1>
          <p className="text-sm text-slate-500">
            Demand notices served, trade licence notices issued and trade licence applications received - for a day or a period, ward-wise
            and Tax Collector-wise.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <label className="text-xs font-medium text-slate-600">
            From
            <input
              type="date"
              className={`${input} mt-1 block`}
              value={f.from}
              max={f.to}
              onChange={(e) => setF((x) => ({ ...x, from: e.target.value }))}
            />
          </label>
          <label className="text-xs font-medium text-slate-600">
            To
            <input
              type="date"
              className={`${input} mt-1 block`}
              value={f.to}
              min={f.from}
              max={today}
              onChange={(e) => setF((x) => ({ ...x, to: e.target.value }))}
            />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Ward
            <select className={`${input} mt-1 block`} value={f.ward ?? ""} onChange={(e) => setF((x) => ({ ...x, ward: e.target.value }))}>
              <option value="">All wards</option>
              {wards.map((w) => (
                <option key={w} value={w}>
                  Ward {w}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Tax Collector
            <select
              className={`${input} mt-1 block`}
              value={f.collector ?? ""}
              onChange={(e) => setF((x) => ({ ...x, collector: e.target.value }))}
            >
              <option value="">All Tax Collectors</option>
              {collectors.map((c) => (
                <option key={c.username} value={c.username}>
                  {c.name}
                  {c.code ? ` (${c.code})` : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-1.5">
            <button className={btn} onClick={() => preset(today, today)}>
              Today
            </button>
            <button className={btn} onClick={() => preset(shift(today, -1), shift(today, -1))}>
              Yesterday
            </button>
            <button className={btn} onClick={() => preset(shift(today, -6), today)}>
              Last 7 days
            </button>
            <button className={btn} onClick={() => preset(`${today.slice(0, 7)}-01`, today)}>
              This month
            </button>
          </div>
          <button
            className={`${btn} ml-auto`}
            onClick={() => downloadNoticeReport(f).catch((e) => setError(e instanceof Error ? e.message : "Download failed."))}
          >
            <Download className="h-4 w-4" /> Download Excel
          </button>
        </div>

        {error && (
          <p className="flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertCircle className="h-4 w-4" /> {error}
          </p>
        )}
        {loading && !report && (
          <div className="flex justify-center py-10 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}

        {report && (
          <>
            <p className="text-sm text-slate-600">
              {single ? `On ${dayText(f.from)}` : `From ${dayText(f.from)} to ${dayText(f.to)}`}
              {f.ward ? ` · Ward ${f.ward}` : ""}
              {f.collector ? ` · ${collectors.find((c) => c.username === f.collector)?.name ?? f.collector}` : ""}
              {loading && <Loader2 className="ml-2 inline h-4 w-4 animate-spin text-slate-400" />}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Kpi
                label="Demand notices served"
                value={String(report.served.total)}
                sub={`${money(report.served.amount)} demanded · ${report.served.split.find((s) => s.label === "Paid since")?.count ?? 0} paid since`}
                active={tab === "served"}
                onClick={() => setTab("served")}
              />
              <Kpi
                label="Trade licence notices issued"
                value={String(report.tlNotices.total)}
                sub={
                  [
                    ...report.tlNotices.split.map((s) => `${s.count} ${s.label.toLowerCase()}`),
                    `${report.tlNotices.rows.filter((r) => r.receiving_uploaded_at).length} receiving copies uploaded`,
                  ].join(" · ") || undefined
                }
                active={tab === "tlNotices"}
                onClick={() => setTab("tlNotices")}
              />
              <Kpi
                label="Trade licence applications received"
                value={String(report.tlApplications.total)}
                sub={report.tlApplications.split.map((s) => `${s.count} ${s.label.toLowerCase()}`).join(" · ") || undefined}
                active={tab === "tlApplications"}
                onClick={() => setTab("tlApplications")}
              />
            </div>

            <div className="flex flex-wrap gap-1 border-b border-slate-200">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === t.id ? "border-nnm-blue text-nnm-blue" : "border-transparent text-slate-500 hover:text-slate-800"}`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab === "served" && (
              <p className="text-xs text-slate-500">
                Served = the signed receiving copy uploaded by the Tax Collector; the date is the day it was uploaded. &quot;Generated&quot;
                is the number of notices generated in the same period, for comparison.
              </p>
            )}
            {tab === "tlApplications" && (
              <p className="text-xs text-slate-500">
                An application that came in against a Tax Collector&apos;s notice is credited to that Tax Collector (his collection). Any
                other application is an automatic application and is not credited to a Tax Collector.
              </p>
            )}

            {b && <Breakdowns b={b} showAmount={tab === "served"} extraWard={tab === "served" ? "Generated" : undefined} />}

            {b && tab === "served" && (
              <Table
                title="Notices served"
                note={report.served.truncated ? "(first 5,000 shown - download Excel for the rest)" : undefined}
                head={["Served on", "Ward", "Tax Collector", "Demand no.", "Holding", "Owner", "Amount", "Paid", "Copy"]}
              >
                {b.rows.length === 0 ? (
                  <Empty cols={9} />
                ) : (
                  b.rows.map((r) => (
                    <tr key={String(r.copy_id)} className="border-t border-slate-100">
                      <td className="whitespace-nowrap px-3 py-1.5">{when(r.served_at, true)}</td>
                      <td className="px-3 py-1.5 text-right">{String(r.ward ?? "-")}</td>
                      <td className="px-3 py-1.5 text-right">{String(r.coll_name ?? "-")}</td>
                      <td className="px-3 py-1.5 text-right">{String(r.demand_no)}</td>
                      <td className="px-3 py-1.5 text-right">{String(r.holding_no)}</td>
                      <td className="px-3 py-1.5 text-right">{String(r.owner_name ?? "")}</td>
                      <td className="px-3 py-1.5 text-right">{money(Number(r.amount))}</td>
                      <td className="px-3 py-1.5 text-right">{r.settled ? "Yes" : "No"}</td>
                      <td className="px-3 py-1.5 text-right">
                        <button
                          title="Signed receiving copy"
                          className="text-nnm-blue hover:underline"
                          onClick={() => openReceivingCopy(String(r.copy_id)).catch((e) => setError(e.message))}
                        >
                          <ImageIcon className="inline h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </Table>
            )}
            {b && tab === "tlNotices" && (
              <Table
                title="Trade licence notices issued"
                note={report.tlNotices.truncated ? "(first 5,000 shown - download Excel for the rest)" : undefined}
                head={[
                  "Issued on",
                  "Ward",
                  "Tax Collector",
                  "Notice no.",
                  "Notice",
                  "Due on",
                  "Holding",
                  "Business",
                  "Phone",
                  "Status now",
                  "Receiving copy",
                ]}
              >
                {b.rows.length === 0 ? (
                  <Empty cols={11} />
                ) : (
                  b.rows.map((r) => (
                    <tr key={String(r.notice_no)} className="border-t border-slate-100">
                      <td className="whitespace-nowrap px-3 py-1.5">{when(r.issued_on)}</td>
                      <td className="px-3 py-1.5 text-right">{String(r.ward ?? "-")}</td>
                      <td className="px-3 py-1.5 text-right">{String(r.coll_name ?? "-")}</td>
                      <td className="px-3 py-1.5 text-right">{String(r.notice_no)}</td>
                      <td className="px-3 py-1.5 text-right">{Number(r.level) === 1 ? "First" : "Second"}</td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-right">{when(r.due_on)}</td>
                      <td className="px-3 py-1.5 text-right">{String(r.holding_no)}</td>
                      <td className="px-3 py-1.5 text-right">
                        {String(r.business_name ?? "")}
                        {!!r.latitude && !!r.longitude && (
                          <a
                            href={`https://www.google.com/maps?q=${String(r.latitude)},${String(r.longitude)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="block text-xs text-nnm-blue hover:underline"
                          >
                            📍 map
                          </a>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right">{String(r.phone ?? "")}</td>
                      <td className="px-3 py-1.5 text-right">{String(r.status).replace(/_/g, " ")}</td>
                      <td className="px-3 py-1.5 text-right">
                        {r.receiving_uploaded_at ? (
                          <button
                            title="Signed receiving copy"
                            className="text-nnm-blue hover:underline"
                            onClick={() => openTlReceivingCopy(String(r.notice_id)).catch((e) => setError(e.message))}
                          >
                            <ImageIcon className="inline h-4 w-4" />
                          </button>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </Table>
            )}
            {b && tab === "tlApplications" && (
              <Table
                title="Trade licence applications received"
                note={report.tlApplications.truncated ? "(first 5,000 shown - download Excel for the rest)" : undefined}
                head={[
                  "Received on",
                  "Ward",
                  "Credited to",
                  "Application no.",
                  "Type",
                  "Applicant",
                  "Business",
                  "Notice",
                  "Through",
                  "Status",
                ]}
              >
                {b.rows.length === 0 ? (
                  <Empty cols={10} />
                ) : (
                  b.rows.map((r) => (
                    <tr key={String(r.application_number)} className="border-t border-slate-100">
                      <td className="whitespace-nowrap px-3 py-1.5">{when(r.requested_at, true)}</td>
                      <td className="px-3 py-1.5 text-right">{String(r.ward ?? "-")}</td>
                      <td className="px-3 py-1.5 text-right">{r.source === "notice" ? String(r.coll_name ?? "-") : "Automatic"}</td>
                      <td className="px-3 py-1.5 text-right">{String(r.application_number)}</td>
                      <td className="px-3 py-1.5 text-right">{String(r.application_type)}</td>
                      <td className="px-3 py-1.5 text-right">{String(r.applicant_name)}</td>
                      <td className="px-3 py-1.5 text-right">{String(r.entity_name)}</td>
                      <td className="px-3 py-1.5 text-right">{r.tl_notice_no ? String(r.tl_notice_no) : "-"}</td>
                      <td className="px-3 py-1.5 text-right">{String(r.channel)}</td>
                      <td className="px-3 py-1.5 text-right capitalize">{String(r.status)}</td>
                    </tr>
                  ))
                )}
              </Table>
            )}
          </>
        )}
      </main>
    </div>
  );
}
