"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, FileText, Loader2, Upload } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import { fetchKhatians, KHATIAN_STATUS, MAX_KHATIAN_BYTES, openKhatianPdf, SURVEY_WARDS, uploadKhatian, type Khatian, type KhatianStatus } from "@/lib/khatian-api";

const inputClass = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-nnm-blue";
const labelClass = "mb-1 block text-xs font-medium text-slate-600";

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
}

export default function KhatianUploadPage() {
  const admin = useAdminGuard();
  const [ward, setWard] = useState("");
  const [sheetNo, setSheetNo] = useState("");
  const [partNo, setPartNo] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [mine, setMine] = useState<Khatian[] | null>(null);
  const [filter, setFilter] = useState<KhatianStatus | "">("");
  const fileRef = useRef<HTMLInputElement>(null);

  function load() {
    fetchKhatians({ mine: true, status: filter || undefined })
      .then((r) => setMine(r.khatians))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load your uploads."));
  }

  useEffect(() => {
    if (admin?.role === "abhilekh_prabhari") load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin, filter]);

  if (!admin) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  if (admin.role !== "abhilekh_prabhari") {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <p className="p-10 text-sm text-slate-500">This page is for the Abhilekh Prabhari.</p>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(null);
    if (!ward || !sheetNo.trim() || !partNo.trim()) return setError("Enter the ward, survey sheet number and part number.");
    if (!file) return setError("Choose the scanned khatian PDF.");
    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") return setError("The khatian must be a PDF file.");
    if (file.size > MAX_KHATIAN_BYTES) return setError("The PDF is larger than 50 MB - scan at a lower resolution or split it.");
    setProgress(0);
    try {
      const k = await uploadKhatian({ ward, sheetNo: sheetNo.trim(), partNo: partNo.trim() }, file, setProgress);
      setDone(`Uploaded: Ward ${k.survey_ward}, Sheet ${k.survey_sheet_no}, Part ${k.part_no}${k.version > 1 ? ` (version ${k.version})` : ""} - sent to the DMC for review.`);
      setSheetNo("");
      setPartNo("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setProgress(null);
    }
  }

  function reupload(k: Khatian) {
    setWard(k.survey_ward);
    setSheetNo(k.survey_sheet_no);
    setPartNo(k.part_no);
    setDone(null);
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
    fileRef.current?.focus();
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">Khatian Upload</h1>
        <p className="mb-6 text-sm text-slate-500">
          Upload the scanned khatian as one PDF for each ward, survey sheet and part. It goes to the Deputy Municipal Commissioner for
          review. A returned khatian can be corrected and uploaded again; an approved one is final.
        </p>

        {error && (
          <div role="alert" className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
        {done && (
          <div className="mb-4 flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {done}
          </div>
        )}

        <form onSubmit={submit} className="mb-8 grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-3">
          <div>
            <label className={labelClass}>Ward</label>
            <select value={ward} onChange={(e) => setWard(e.target.value)} className={inputClass}>
              <option value="">Select ward</option>
              {SURVEY_WARDS.map((w) => (
                <option key={w} value={w}>
                  Ward {w}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Survey sheet no.</label>
            <input value={sheetNo} onChange={(e) => setSheetNo(e.target.value)} maxLength={20} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Part no.</label>
            <input value={partNo} onChange={(e) => setPartNo(e.target.value)} maxLength={20} className={inputClass} />
          </div>
          <div className="sm:col-span-3">
            <label className={labelClass}>Scanned khatian (PDF, up to 50 MB)</label>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium"
            />
            {file && <p className="mt-1 text-xs text-slate-500">{(file.size / 1048576).toFixed(1)} MB</p>}
          </div>
          <div className="sm:col-span-3">
            <button
              type="submit"
              disabled={progress !== null}
              className="inline-flex items-center gap-2 rounded-md bg-nnm-blue px-5 py-2.5 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
            >
              {progress !== null ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {progress !== null ? `Uploading… ${progress}%` : "Upload for review"}
            </button>
          </div>
        </form>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-base font-semibold text-slate-900">My uploads</h2>
          {(["", "pending", "returned", "approved"] as const).map((s) => (
            <button
              key={s || "all"}
              onClick={() => setFilter(s)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${filter === s ? "bg-nnm-blue text-white" : "border border-slate-300 bg-white text-slate-700"}`}
            >
              {s === "" ? "All" : KHATIAN_STATUS[s].label.split(" - ")[0]}
            </button>
          ))}
        </div>
        {!mine ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : mine.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Nothing uploaded yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2">Ward / Sheet / Part</th>
                  <th className="px-3 py-2">Uploaded</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {mine.map((k) => (
                  <tr key={k.id} className="border-t border-slate-100 align-top">
                    <td className="px-3 py-2 font-medium">
                      {k.survey_ward} / {k.survey_sheet_no} / {k.part_no}
                      {k.version > 1 && <span className="ml-1 text-xs font-normal text-slate-400">v{k.version}</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500">{when(k.uploaded_at)}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${KHATIAN_STATUS[k.status].tone}`}>{KHATIAN_STATUS[k.status].label}</span>
                      {k.review_remarks && <div className="mt-1 max-w-[320px] text-xs text-slate-600">DMC: {k.review_remarks}</div>}
                    </td>
                    <td className="space-x-2 whitespace-nowrap px-3 py-2 text-right">
                      <button
                        onClick={() => openKhatianPdf(k.id).catch((err) => setError(err instanceof Error ? err.message : "Could not open the PDF."))}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700"
                      >
                        <FileText className="h-3 w-3" />
                        View
                      </button>
                      {k.status !== "approved" && (
                        <button onClick={() => reupload(k)} className="rounded-md border border-nnm-blue px-2 py-1 text-xs font-semibold text-nnm-blue">
                          Re-upload
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
