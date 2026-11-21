"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ChevronLeft, ChevronRight, ClipboardList, Loader2, Search } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import { ADMIN_ROLE_LABELS, type AdminRole } from "@/lib/admin-auth";
import { fetchFieldMigRecords, latestArv, takeUpMigRecord, type MigRecord } from "@/lib/mig-records-api";

const VIEWERS = ["tax_collector", "tax_surveyor", "tax_daroga", "commissioner", "city_manager", "deputy_commissioner"];
const input = "rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-nnm-blue focus:outline-none";
type Show = "approved" | "taken_up";

/**
 * Old Records (MIG) - Tax Collector, Tax Surveyor, Tax Daroga and the Commissioner (City Manager and DMC view): the
 * approved old records, ward-wise. At a house with no MUNG id but an old tax receipt, find it here (old holding no.,
 * old PID, owner name or MIG no.) and "Add more details": it becomes MUNG-MIG-<same number> and the full details entry
 * opens - then Tax Surveyor / Tax Daroga, City Manager, DMC and the Commissioner approve, and it gets its MNN- number.
 */
export default function OldRecordsPage() {
  const admin = useAdminGuard();
  const router = useRouter();
  const [show, setShow] = useState<Show>("approved");
  const [ward, setWard] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchFieldMigRecords>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await fetchFieldMigRecords({ show, ward, q, page }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load.");
    }
  }, [show, ward, q, page]);

  useEffect(() => {
    if (admin && VIEWERS.includes(admin.role)) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- search runs on Enter / button
  }, [admin, show, ward, page]);

  if (!admin) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  if (!VIEWERS.includes(admin.role))
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <p className="mx-auto mt-10 max-w-xl rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Not available for your login.
        </p>
      </div>
    );

  async function addDetails(r: MigRecord) {
    setBusyId(r.id);
    setError(null);
    try {
      const { holdingNo } = await takeUpMigRecord(r.id);
      router.push(`/admin/report-property-discrepancy?holding=${encodeURIComponent(holdingNo)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open the record.");
      setBusyId(null);
    }
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const action = (r: MigRecord) => {
    if (!data?.canAddDetails) return null;
    if (r.status === "approved")
      return (
        <button
          onClick={() => addDetails(r)}
          disabled={busyId !== null}
          className="inline-flex items-center gap-1 rounded-md bg-nnm-blue px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {busyId === r.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Add more details
        </button>
      );
    if (r.entry?.status === "pending")
      return (
        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">
          With {ADMIN_ROLE_LABELS[r.entry.stage as AdminRole] ?? r.entry.stage}
        </span>
      );
    if (r.entry?.status === "reverted")
      return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Sent back to {r.entry.by}</span>;
    // Taken up but the details not submitted yet - anyone may continue.
    return (
      <Link
        href={`/admin/report-property-discrepancy?holding=${encodeURIComponent(r.holdingNo ?? "")}`}
        className="rounded-md border border-nnm-blue px-3 py-1.5 text-xs font-semibold text-nnm-blue"
      >
        Continue entry
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />
      <main className="mx-auto max-w-5xl space-y-4 px-4 py-8 sm:px-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
            <ClipboardList className="h-6 w-6" /> Old Records (MIG)
          </h1>
          <p className="text-sm text-slate-500">
            A house with no MUNG id but an old tax receipt, or an old house: find its old record here and add the full details. It becomes a
            MUNG-MIG holding and goes for approval (Tax Surveyor / Tax Daroga, City Manager, DMC, Municipal Commissioner); on final approval
            it gets its MNN- number.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {(
            [
              ["approved", "To enter (MIG)"],
              ["taken_up", "Being entered (MUNG-MIG)"],
            ] as [Show, string][]
          ).map(([v, l]) => (
            <button
              key={v}
              onClick={() => {
                setShow(v);
                setPage(1);
              }}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold ${show === v ? "bg-nnm-blue text-white" : "border border-slate-200 bg-white text-slate-600"}`}
            >
              {l}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-3">
          <div>
            <label className="mb-1 block text-xs text-slate-500" htmlFor="o-ward">
              Ward
            </label>
            <select
              id="o-ward"
              value={ward}
              onChange={(e) => {
                setWard(e.target.value);
                setPage(1);
              }}
              className={input}
            >
              <option value="">{admin.role === "tax_collector" ? "All my wards" : "All wards"}</option>
              {(data?.wards ?? []).map((w) => (
                <option key={w} value={w}>
                  Ward {w}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-56 flex-1">
            <label className="mb-1 block text-xs text-slate-500" htmlFor="o-q">
              Old holding no. / old PID / owner name / MIG no.
            </label>
            <input
              id="o-q"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setPage(1);
                  load();
                }
              }}
              placeholder="e.g. 245, Ram Prasad or MIG-13980"
              className={`${input} w-full`}
            />
          </div>
          <button
            onClick={() => {
              setPage(1);
              load();
            }}
            className="inline-flex items-center gap-1.5 rounded-md bg-nnm-blue px-4 py-2 text-sm font-semibold text-white"
          >
            <Search className="h-4 w-4" /> Search
          </button>
        </div>

        {error && (
          <p role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </p>
        )}

        {!data ? (
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        ) : data.records.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">Nothing found.</p>
        ) : (
          <>
            <p className="text-xs text-slate-500">{data.total.toLocaleString("en-IN")} record(s)</p>
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
              {data.records.map((r) => (
                <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">
                      {r.ownerName}
                      {r.relativeName && (
                        <span className="font-normal text-slate-500">
                          {" "}
                          {r.relation ?? ""} {r.relativeName}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-600">
                      Ward {r.ward ?? "-"} · Old holding <b>{r.oldHoldingNo ?? "-"}</b>
                      {r.oldPid ? ` · Old PID ${r.oldPid}` : ""} ·{" "}
                      <span className="font-mono">{r.status === "taken_up" ? r.holdingNo : r.migNo}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {r.lastPaymentYear ? `Last paid ${r.lastPaymentYear}` : "No payment year on record"}
                      {latestArv(r) !== null ? ` · ARV ${latestArv(r)!.toLocaleString("en-IN")}` : ""}
                      {r.taxStatus ? ` · ${r.taxStatus}` : ""}
                    </p>
                  </div>
                  {action(r)}
                </li>
              ))}
            </ul>
            {pages > 1 && (
              <div className="flex items-center justify-center gap-3 text-sm">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  className="inline-flex items-center gap-1 rounded-md border bg-white px-3 py-1.5 disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" /> Previous
                </button>
                <span className="text-slate-500">
                  Page {page} of {pages}
                </span>
                <button
                  disabled={page >= pages}
                  onClick={() => setPage(page + 1)}
                  className="inline-flex items-center gap-1 rounded-md border bg-white px-3 py-1.5 disabled:opacity-40"
                >
                  Next <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
