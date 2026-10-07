"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, Loader2 } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import { fetchImportBatches, type ImportBatch } from "@/lib/holding-import-api";

function fmt(v: string): string {
  return new Date(v).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function HoldingImportsPage() {
  const admin = useAdminGuard();
  const [batches, setBatches] = useState<ImportBatch[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!admin || !["tax_daroga", "city_manager", "commissioner"].includes(admin.role)) return;
    fetchImportBatches().then(setBatches).catch((e) => setError(e instanceof Error ? e.message : "Could not load uploads."));
  }, [admin]);

  if (!admin) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;

  if (!["tax_daroga", "city_manager", "commissioner"].includes(admin.role)) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <main className="mx-auto max-w-2xl px-6 py-10">
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Uploaded holdings can be viewed only by the Tax Daroga, City Manager and Commissioner.
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="mb-1 text-2xl font-semibold text-slate-900">Uploaded Holdings - Review</h1>
            <p className="text-sm text-slate-500">
              {admin.role === "commissioner"
                ? "Progress of bulk-uploaded holdings being integrated into the live data."
                : "Bulk uploads wait here. Nothing goes live until the City Manager gives final approval and integrates it."}
            </p>
          </div>
          <Link href="/admin/properties-bulk-upload" className="rounded-md bg-nnm-blue px-4 py-2 text-sm font-semibold text-white hover:bg-nnm-blue-dark">
            Upload a file
          </Link>
        </div>

        {error && (
          <div role="alert" className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
        {!batches && !error && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        )}
        {batches && batches.length === 0 && <p className="text-sm text-slate-500">No uploads yet.</p>}

        <div className="space-y-3">
          {batches?.map((b) => (
            <Link key={b.id} href={`/admin/holding-imports/${b.id}`} className="block rounded-xl border border-slate-200 bg-white p-4 hover:border-nnm-blue">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-slate-900">{b.dataSourceName}</h2>
                {b.status === "discarded" ? (
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600">Discarded</span>
                ) : b.integrating ? (
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-blue-700">Integrating…</span>
                ) : b.counts.pending + b.counts.failed === 0 ? (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-green-700">Done</span>
                ) : (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-700">Awaiting review</span>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {b.fileName ? `${b.fileName} · ` : ""}uploaded by {b.uploadedBy} on {fmt(b.uploadedAt)}
              </p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full bg-green-500" style={{ width: `${b.totalHoldings ? Math.round((b.counts.integrated / b.totalHoldings) * 100) : 0}%` }} />
              </div>
              <p className="mt-2 text-sm text-slate-700">
                {b.totalHoldings} holdings · <span className="text-amber-700">{b.counts.pending} pending</span> ·{" "}
                <span className="text-green-700">{b.counts.integrated} integrated</span> · {b.counts.excluded} kept out
                {b.counts.failed > 0 && <span className="text-red-700"> · {b.counts.failed} failed</span>}
              </p>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
