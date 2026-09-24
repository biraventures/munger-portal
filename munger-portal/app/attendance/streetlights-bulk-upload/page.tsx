"use client";

import { useState } from "react";
import { Upload, AlertCircle, CheckCircle2, Lightbulb } from "lucide-react";
import { AttendanceHeader } from "@/components/attendance/attendance-header";
import { useAttendanceGuard } from "@/lib/use-attendance-guard";
import { uploadStreetWiseLightsCsv, type StreetWiseImportResult } from "@/lib/streetlight-api";

export default function StreetlightsBulkUploadPage() {
  const attendance = useAttendanceGuard();
  const [agency, setAgency] = useState<"NN" | "EESL">("NN");
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StreetWiseImportResult | null>(null);

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setUploading(true);
    setError(null);
    setResult(null);
    try {
      const csvContent = await file.text();
      const res = await uploadStreetWiseLightsCsv(agency, csvContent);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload this file.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  if (!attendance) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  if (attendance.role !== "municipal_commissioner" && attendance.role !== "attendance_admin") {
    return (
      <div className="min-h-screen bg-slate-50">
        <AttendanceHeader user={attendance} />
        <main className="mx-auto max-w-2xl px-6 py-10">
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            This is restricted to the Municipal Commissioner.
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AttendanceHeader user={attendance} />

      <main className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <Lightbulb className="h-6 w-6" />
          Streetlight Bulk Upload
        </h1>
        <p className="mb-6 text-sm text-slate-500">
          One row per street segment - Ward No, start point/street name, intermediate point (optional), street end point
          (optional), and the light count established by the chosen agency. GPS for the start and end points can be added
          afterward from the Street Segments page.
        </p>

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <label className="mb-1 block text-xs font-medium text-slate-600">Agency</label>
          <div className="mb-5 flex gap-2">
            <button
              onClick={() => setAgency("NN")}
              className={`rounded-md px-4 py-2 text-sm font-semibold ${agency === "NN" ? "bg-nnm-blue text-white" : "border border-slate-300 text-slate-600 hover:bg-slate-50"}`}
            >
              Nagar Nigam
            </button>
            <button
              onClick={() => setAgency("EESL")}
              className={`rounded-md px-4 py-2 text-sm font-semibold ${agency === "EESL" ? "bg-nnm-blue text-white" : "border border-slate-300 text-slate-600 hover:bg-slate-50"}`}
            >
              EESL
            </button>
          </div>

          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-dashed border-slate-300 px-4 py-8 text-sm text-slate-500 hover:border-nnm-blue hover:text-nnm-blue">
            <Upload className="h-4 w-4" />
            {uploading ? "Uploading…" : fileName ?? "Choose a CSV file"}
            <input type="file" accept=".csv" className="hidden" onChange={handleFileSelected} disabled={uploading} />
          </label>

          {error && (
            <div role="alert" className="mt-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {result && (
            <div className="mt-4">
              <div role="status" className="mb-3 flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                {result.segmentsCreated} street segment{result.segmentsCreated === 1 ? "" : "s"} and {result.lightsCreated} light
                {result.lightsCreated === 1 ? "" : "s"} created
                {result.faultsCreated > 0 ? `, with ${result.faultsCreated} already flagged as non-functional.` : "."}
              </div>
              {result.errors.length > 0 && (
                <details className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  <summary className="cursor-pointer font-semibold">{result.errors.length} row(s) skipped</summary>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {result.errors.map((e, i) => (
                      <li key={i}>
                        <span className="font-mono">row {e.row}</span>: {e.message}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
