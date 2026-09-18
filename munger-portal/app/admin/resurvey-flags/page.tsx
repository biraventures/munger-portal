"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Download, FileWarning, XCircle } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import { fetchResurveyFlags, reviewResurveyFlag, downloadResurveyFlagsExport, type PropertyResurveyFlag } from "@/lib/admin-api";

const ROLES = ["tax_daroga", "commissioner"];

export default function ResurveyFlagsPage() {
  const admin = useAdminGuard();
  const [flags, setFlags] = useState<PropertyResurveyFlag[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);

  function load() {
    fetchResurveyFlags()
      .then(setFlags)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the re-survey flag trail."));
  }

  useEffect(() => {
    if (!admin) return;
    load();
  }, [admin]);

  async function handleReview(id: number, status: "reviewed" | "dismissed") {
    setActing(id);
    setError(null);
    try {
      await reviewResurveyFlag(id, status, null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not review this flag.");
    } finally {
      setActing(null);
    }
  }

  async function handleExport() {
    setExporting(true);
    setError(null);
    try {
      await downloadResurveyFlagsExport();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not download the export.");
    } finally {
      setExporting(false);
    }
  }

  if (!admin) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  if (!ROLES.includes(admin.role)) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <main className="mx-auto max-w-2xl px-6 py-10">
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            This is restricted to the Tax Daroga and Commissioner.
          </div>
        </main>
      </div>
    );
  }

  const open = flags?.filter((f) => f.status === "open") ?? [];
  const decided = flags?.filter((f) => f.status !== "open") ?? [];

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />

      <main className="mx-auto max-w-3xl px-6 py-10">
        <div className="mb-1 flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
            <FileWarning className="h-6 w-6" />
            Re-Survey Flags
          </h1>
          {admin.role === "commissioner" && (
            <button
              onClick={handleExport}
              disabled={exporting}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              <Download className="h-3.5 w-3.5" />
              {exporting ? "Downloading…" : "Export (.xlsx)"}
            </button>
          )}
        </div>
        <p className="mb-6 text-sm text-slate-500">Holdings a Tax Collector flagged during collection as looking different from the recorded details.</p>

        {error && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {!flags ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : (
          <>
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Open ({open.length})</h2>
            {open.length === 0 ? (
              <p className="mb-6 text-sm text-slate-400">Nothing open right now.</p>
            ) : (
              <div className="mb-8 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                {open.map((f) => (
                  <div key={f.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{f.holding_no}</p>
                        <p className="text-xs text-slate-500">
                          Flagged by {f.flagged_by_display_name} on {new Date(f.flagged_at).toLocaleDateString("en-IN")}
                        </p>
                        <p className="mt-1 text-sm text-slate-700">{f.remarks}</p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          onClick={() => handleReview(f.id, "reviewed")}
                          disabled={acting === f.id}
                          className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-60"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Reviewed
                        </button>
                        <button
                          onClick={() => handleReview(f.id, "dismissed")}
                          disabled={acting === f.id}
                          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Dismiss
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <h2 className="mb-3 text-sm font-semibold text-slate-700">Decided ({decided.length})</h2>
            {decided.length === 0 ? (
              <p className="text-sm text-slate-400">Nothing here yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                {decided.map((f) => (
                  <div key={f.id} className="p-4">
                    <p className="text-sm font-semibold text-slate-800">
                      {f.holding_no}{" "}
                      <span className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${f.status === "reviewed" ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-600"}`}>
                        {f.status}
                      </span>
                    </p>
                    <p className="text-xs text-slate-500">
                      Flagged by {f.flagged_by_display_name} - {f.status} by {f.reviewed_by_display_name}
                    </p>
                    <p className="mt-1 text-sm text-slate-700">{f.remarks}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
