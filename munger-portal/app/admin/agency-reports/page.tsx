"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Download, Loader2 } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import {
  downloadAgencyReport,
  fetchAgencyReport,
  fetchReportFilterOptions,
  type AgencyReport,
  type CollectorRow,
  type DatasetReport,
  type ReportFilterOptions,
  type ReportPeriod,
  type SeriesPoint,
  type WardRow,
} from "@/lib/agency-api";

const ALLOWED = ["agency_project_manager", "commissioner", "deputy_commissioner", "city_manager", "tax_daroga", "tax_collector"];
const PERIODS: { id: ReportPeriod; label: string }[] = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "annual", label: "Annual (Apr-Mar)" },
];
type Tab = "collection" | "notices" | "flags" | "ranking";

const money = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function bucketLabel(period: ReportPeriod, bucket: string): string {
  if (period === "annual") return `FY ${bucket}`;
  const [y, m, d] = bucket.split("-");
  if (period === "monthly") return `${MONTHS[Number(m) - 1]} ${y}`;
  const day = `${d} ${MONTHS[Number(m) - 1]} ${y}`;
  return period === "weekly" ? `Week of ${day}` : day;
}

function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-2 w-full min-w-24 rounded-full bg-slate-100">
      <div className="h-2 rounded-full bg-nnm-blue" style={{ width: value > 0 ? `${pct}%` : 0 }} />
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

function Table({ title, head, children }: { title: string; head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-800">{title}</div>
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs text-slate-500">
          <tr>
            {head.map((h, i) => (
              <th key={h} className={`px-3 py-2 ${i > 0 ? "text-right" : ""}`}>
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

function SeriesTable({ title, period, series, withAmount, labels }: { title: string; period: ReportPeriod; series: SeriesPoint[]; withAmount: boolean; labels: [string, string?] }) {
  const max = Math.max(0, ...series.map((s) => (withAmount ? s.amount : s.count)));
  return (
    <Table title={title} head={["Period", labels[0], ...(withAmount ? ["Amount"] : []), ...(labels[1] ? [labels[1]] : []), ""]}>
      {series.map((s) => (
        <tr key={s.bucket} className="border-t border-slate-100">
          <td className="px-3 py-2">{bucketLabel(period, s.bucket)}</td>
          <td className="px-3 py-2 text-right">{s.count.toLocaleString("en-IN")}</td>
          {withAmount && <td className="px-3 py-2 text-right">{money(s.amount)}</td>}
          {labels[1] && <td className="px-3 py-2 text-right">{s.count2.toLocaleString("en-IN")}</td>}
          <td className="w-40 px-3 py-2">
            <Bar value={withAmount ? s.amount : s.count} max={max} />
          </td>
        </tr>
      ))}
      {series.length === 0 && <Empty cols={5} />}
    </Table>
  );
}

function WardTable({ title, rows, withAmount, labels, sort }: { title: string; rows: WardRow[]; withAmount: boolean; labels: [string, string?]; sort: "amount" | "count" | "ward" }) {
  const sorted = [...rows].sort((a, b) => (sort === "ward" ? 0 : sort === "amount" ? b.amount - a.amount : b.count - a.count));
  const max = Math.max(0, ...sorted.map((r) => (withAmount ? r.amount : r.count)));
  return (
    <Table title={title} head={["Ward", labels[0], ...(withAmount ? ["Amount"] : []), ...(labels[1] ? [labels[1]] : []), ""]}>
      {sorted.map((r) => (
        <tr key={r.ward} className="border-t border-slate-100">
          <td className="px-3 py-2 font-medium">{r.ward}</td>
          <td className="px-3 py-2 text-right">{r.count.toLocaleString("en-IN")}</td>
          {withAmount && <td className="px-3 py-2 text-right">{money(r.amount)}</td>}
          {labels[1] && <td className="px-3 py-2 text-right">{r.count2.toLocaleString("en-IN")}</td>}
          <td className="w-40 px-3 py-2">
            <Bar value={withAmount ? r.amount : r.count} max={max} />
          </td>
        </tr>
      ))}
      {sorted.length === 0 && <Empty cols={5} />}
    </Table>
  );
}

function CollectorTable({ title, rows, withAmount, label }: { title: string; rows: CollectorRow[]; withAmount: boolean; label: string }) {
  const sorted = [...rows].sort((a, b) => (withAmount ? b.amount - a.amount : b.count - a.count));
  const max = Math.max(0, ...sorted.map((r) => (withAmount ? r.amount : r.count)));
  return (
    <Table title={title} head={["Tax Collector", label, ...(withAmount ? ["Amount"] : []), ""]}>
      {sorted.map((r) => (
        <tr key={r.username ?? "none"} className="border-t border-slate-100">
          <td className="px-3 py-2 font-medium">{r.name}</td>
          <td className="px-3 py-2 text-right">{r.count.toLocaleString("en-IN")}</td>
          {withAmount && <td className="px-3 py-2 text-right">{money(r.amount)}</td>}
          <td className="w-40 px-3 py-2">
            <Bar value={withAmount ? r.amount : r.count} max={max} />
          </td>
        </tr>
      ))}
      {sorted.length === 0 && <Empty cols={4} />}
    </Table>
  );
}

function Ranking({ title, rows }: { title: string; rows: { name: string; amount: number; count: number }[] }) {
  return (
    <Table title={title} head={["#", "Name", "Collected", "Receipts"]}>
      {rows.map((r, i) => (
        <tr key={r.name} className="border-t border-slate-100">
          <td className="px-3 py-2 text-slate-400">{i + 1}</td>
          <td className="px-3 py-2 font-medium">{r.name}</td>
          <td className="px-3 py-2 text-right">{money(r.amount)}</td>
          <td className="px-3 py-2 text-right">{r.count.toLocaleString("en-IN")}</td>
        </tr>
      ))}
      {rows.length === 0 && <Empty cols={4} />}
    </Table>
  );
}

function FlagBlock({ title, data, count2Label, period }: { title: string; data: DatasetReport; count2Label?: string; period: ReportPeriod }) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-slate-900">
        {title} <span className="ml-1 text-sm font-normal text-slate-500">{data.total.count.toLocaleString("en-IN")} total{count2Label ? `, ${data.total.count2.toLocaleString("en-IN")} ${count2Label}` : ""}</span>
      </h2>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SeriesTable title="By period" period={period} series={data.series} withAmount={false} labels={["Count"]} />
        <WardTable title="By ward" rows={data.byWard} withAmount={false} labels={["Count"]} sort="count" />
        <CollectorTable title="By Tax Collector" rows={data.byCollector} withAmount={false} label="Count" />
      </div>
      {data.byType && data.byType.length > 0 && (
        <p className="text-xs text-slate-500">
          By type: {data.byType.map((t) => `${t.type.replace(/_/g, " ")} ${t.count}`).join(" · ")}
        </p>
      )}
    </section>
  );
}

export default function AgencyReportsPage() {
  const admin = useAdminGuard();
  const [options, setOptions] = useState<ReportFilterOptions | null>(null);
  const [period, setPeriod] = useState<ReportPeriod>("daily");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [ward, setWard] = useState("");
  const [collector, setCollector] = useState("");
  const [tab, setTab] = useState<Tab>("collection");
  const [report, setReport] = useState<AgencyReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(next?: { period?: ReportPeriod; from?: string; to?: string }) {
    setLoading(true);
    setError(null);
    try {
      const p = next?.period ?? period;
      const r = await fetchAgencyReport({ period: p, from: (next?.from ?? from) || undefined, to: (next?.to ?? to) || undefined, ward: ward || undefined, collector: collector || undefined });
      setReport(r);
      setFrom(r.filters.from);
      setTo(r.filters.to);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the report.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!admin || !ALLOWED.includes(admin.role)) return;
    fetchReportFilterOptions().then(setOptions).catch((err) => setError(err instanceof Error ? err.message : "Could not load the filters."));
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- first load only
  }, [admin]);

  if (!admin) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  if (!ALLOWED.includes(admin.role)) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <main className="mx-auto max-w-2xl px-6 py-10">
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            You don&apos;t have access to these reports.
          </div>
        </main>
      </div>
    );
  }

  function pickPeriod(p: ReportPeriod) {
    setPeriod(p);
    setFrom("");
    setTo("");
    load({ period: p, from: "", to: "" });
  }

  async function handleDownload() {
    setDownloading(true);
    try {
      await downloadAgencyReport({ period, from: from || undefined, to: to || undefined, ward: ward || undefined, collector: collector || undefined });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not download the report.");
    } finally {
      setDownloading(false);
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "collection", label: "Collection" },
    { id: "notices", label: "Demand notice distribution" },
    { id: "flags", label: "Resurvey, new houses & issues" },
    { id: "ranking", label: "Highest & lowest" },
  ];
  const inputClass = "rounded-md border border-slate-300 px-3 py-2 text-sm";

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />
      <main className="mx-auto max-w-6xl space-y-5 px-6 py-8">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Collection &amp; Field Reports</h1>
          <p className="text-sm text-slate-500">Collection, demand notice distribution, resurvey flags, new houses and collection issues - by ward and by Tax Collector.</p>
        </div>

        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap gap-2">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                onClick={() => pickPeriod(p.id)}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold ${period === p.id ? "bg-nnm-blue text-white" : "border border-slate-300 text-slate-600 hover:bg-slate-50"}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs font-medium text-slate-500">
              From
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${inputClass} mt-1 block`} />
            </label>
            <label className="text-xs font-medium text-slate-500">
              To
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${inputClass} mt-1 block`} />
            </label>
            <label className="text-xs font-medium text-slate-500">
              Ward
              <select value={ward} onChange={(e) => setWard(e.target.value)} className={`${inputClass} mt-1 block`}>
                <option value="">All wards</option>
                {options?.wards.map((w) => (
                  <option key={w} value={w}>
                    Ward {w}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-slate-500">
              Tax Collector
              <select value={collector} onChange={(e) => setCollector(e.target.value)} className={`${inputClass} mt-1 block`}>
                <option value="">All collectors</option>
                {options?.collectors.map((c) => (
                  <option key={c.username} value={c.username}>
                    {c.name}
                    {c.code ? ` (${c.code})` : ""}
                  </option>
                ))}
              </select>
            </label>
            <button onClick={() => load()} disabled={loading} className="rounded-md bg-nnm-blue px-5 py-2 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60">
              {loading ? "Loading…" : "Show"}
            </button>
            <button onClick={handleDownload} disabled={downloading || loading} className="inline-flex items-center gap-1.5 rounded-md border border-nnm-blue px-4 py-2 text-sm font-semibold text-nnm-blue hover:bg-blue-50 disabled:opacity-60">
              <Download className="h-4 w-4" />
              {downloading ? "Preparing…" : "Download Excel"}
            </button>
          </div>
          <p className="text-xs text-slate-400">Days run midnight to midnight Indian time; weeks start on Monday; the annual view is the April-March financial year.</p>
        </div>

        {error && (
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="flex flex-wrap gap-1 border-b border-slate-200">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2 text-sm font-semibold ${tab === t.id ? "border-b-2 border-nnm-blue text-nnm-blue" : "text-slate-500 hover:text-slate-800"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {!report ? (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : (
          <div className={loading ? "opacity-60" : ""}>
            {tab === "collection" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Kpi label="Collected" value={money(report.collection.total.amount)} />
                  <Kpi label="Receipts" value={report.collection.total.count.toLocaleString("en-IN")} />
                  <Kpi label="Wards with collection" value={String(report.collection.byWard.filter((w) => w.count > 0).length)} sub={`of ${report.collection.byWard.length}`} />
                  <Kpi label="Collectors with collection" value={String(report.collection.byCollector.filter((c) => c.count > 0 && c.username).length)} />
                </div>
                <SeriesTable title="Collection by period" period={report.filters.period} series={report.collection.series} withAmount labels={["Receipts"]} />
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <WardTable title="By ward (highest first)" rows={report.collection.byWard} withAmount labels={["Receipts"]} sort="amount" />
                  <CollectorTable title="By Tax Collector (highest first)" rows={report.collection.byCollector} withAmount label="Receipts" />
                </div>
                <p className="text-xs text-slate-400">Payments recorded without a Tax Collector code appear as &quot;Not attributed to a collector&quot;. Cancelled receipts are not counted.</p>
              </div>
            )}

            {tab === "notices" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Kpi label="Notices generated" value={report.noticesGenerated.total.count.toLocaleString("en-IN")} sub={money(report.noticesGenerated.total.amount)} />
                  <Kpi
                    label="Delivered (signed copy uploaded)"
                    value={report.noticesGenerated.total.count2.toLocaleString("en-IN")}
                    sub={report.noticesGenerated.total.count > 0 ? `${Math.round((report.noticesGenerated.total.count2 / report.noticesGenerated.total.count) * 100)}% of generated` : undefined}
                  />
                  <Kpi label="Not yet delivered" value={(report.noticesGenerated.total.count - report.noticesGenerated.total.count2).toLocaleString("en-IN")} />
                  <Kpi label="Signed copies uploaded" value={report.receivingCopies.total.count.toLocaleString("en-IN")} sub="in this period" />
                </div>
                <SeriesTable title="Notices generated by period" period={report.filters.period} series={report.noticesGenerated.series} withAmount labels={["Notices", "Delivered"]} />
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <WardTable title="Notices by ward" rows={report.noticesGenerated.byWard} withAmount={false} labels={["Generated", "Delivered"]} sort="count" />
                  <CollectorTable title="Signed copies uploaded by Tax Collector" rows={report.receivingCopies.byCollector} withAmount={false} label="Copies" />
                </div>
                <p className="text-xs text-slate-400">A notice counts as delivered once a Tax Collector has uploaded at least one signed receiving copy for it. The collector filter applies to the signed copies only.</p>
              </div>
            )}

            {tab === "flags" && (
              <div className="space-y-8">
                <FlagBlock title="Holdings flagged for resurvey" data={report.resurveyFlags} count2Label="still open" period={report.filters.period} />
                <FlagBlock title="New houses flagged for survey" data={report.newHouses} period={report.filters.period} />
                <FlagBlock title="Collection issues raised" data={report.collectionIssues} period={report.filters.period} />
              </div>
            )}

            {tab === "ranking" && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <Ranking title="Highest collection - wards" rows={report.ranking.highestWards.map((w) => ({ name: `Ward ${w.ward}`, amount: w.amount, count: w.count }))} />
                  <Ranking title="Lowest collection - wards" rows={report.ranking.lowestWards.map((w) => ({ name: `Ward ${w.ward}`, amount: w.amount, count: w.count }))} />
                  <Ranking title="Highest collection - Tax Collectors" rows={report.ranking.highestCollectors.map((c) => ({ name: c.name, amount: c.amount, count: c.count }))} />
                  <Ranking title="Lowest collection - Tax Collectors" rows={report.ranking.lowestCollectors.map((c) => ({ name: c.name, amount: c.amount, count: c.count }))} />
                </div>
                <p className="text-xs text-slate-400">Based on the period and filters above. Wards and collectors with no collection are included, so the lowest list shows them.</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
