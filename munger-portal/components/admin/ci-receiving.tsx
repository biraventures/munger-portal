"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, History, Loader2, Upload, X } from "lucide-react";
import { PhotoSourceButtons, PickedFilePreview } from "@/components/admin/photo-source-buttons";
import type { CollectionIssueNoticeSummary } from "@/lib/admin-api";
import {
  decideCiRemoval,
  fetchCiReceivingLog,
  openCiReceiving,
  openCiRemovedCopy,
  requestCiRemoval,
  uploadCiReceiving,
  type CiReceivingLogEntry,
} from "@/lib/collection-issue-api";

const LOG_LABEL: Record<CiReceivingLogEntry["action"], string> = {
  uploaded: "Uploaded",
  removal_requested: "Removal asked",
  removal_rejected: "Removal rejected by DMC",
  removed: "Removed with DMC's approval",
};
const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }) : "-");

/**
 * The receiving copy of one collection issue notice: shows it (or "not uploaded"), lets the reporting Tax Collector /
 * Tax Daroga / City Manager upload it (photo or PDF), lets them or the Commissioner ask the DMC to remove it, lets the
 * DMC approve or reject, and shows its history.
 */
export function CiReceiving({
  notice,
  reportedBy,
  role,
  username,
  onChanged,
}: {
  notice: CollectionIssueNoticeSummary;
  reportedBy: string;
  role: string;
  username: string;
  onChanged: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<{ file: File; url: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<CiReceivingLogEntry[] | null>(null);

  const canUpload = (role === "tax_collector" && username === reportedBy) || role === "tax_daroga" || role === "city_manager";
  const canAsk = canUpload || role === "commissioner";
  const isDmc = role === "deputy_commissioner";
  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    }
  };

  return (
    <div className="mt-1 text-xs">
      {notice.receiving_uploaded_at ? (
        <>
          <button
            onClick={() => openCiReceiving(notice.id).catch((e) => setError(e.message))}
            className="flex items-center gap-1 text-left text-green-700 hover:underline"
          >
            <CheckCircle2 className="h-3 w-3 shrink-0" /> Receiving copy - {fmt(notice.receiving_uploaded_at)}
            {notice.receiving_by ? `, ${notice.receiving_by}` : ""}
          </button>
          {notice.removal_requested_at ? (
            <p className="mt-0.5 text-amber-800">
              <AlertTriangle className="mr-0.5 inline h-3 w-3" />
              Removal asked by {notice.removal_requested_by} ({fmt(notice.removal_requested_at)}): {notice.removal_reason} - waiting for DMC
              {isDmc && (
                <span className="mt-0.5 flex gap-3">
                  <button
                    onClick={() => {
                      const r = window.prompt("Approve the removal - remark (optional):");
                      if (r !== null) run(() => decideCiRemoval(notice.id, true, r.trim() || null));
                    }}
                    className="font-semibold text-red-700 hover:underline"
                  >
                    Approve removal
                  </button>
                  <button
                    onClick={() => {
                      const r = window.prompt("Reject the removal - remark (optional):");
                      if (r !== null) run(() => decideCiRemoval(notice.id, false, r.trim() || null));
                    }}
                    className="font-semibold text-slate-700 hover:underline"
                  >
                    Reject
                  </button>
                </span>
              )}
            </p>
          ) : (
            canAsk && (
              <button
                onClick={() => {
                  const r = window.prompt(
                    `Why should the receiving copy of ${notice.notice_no} be removed? (The DMC approves the removal.)`,
                  );
                  if (r?.trim()) run(() => requestCiRemoval(notice.id, r.trim()));
                }}
                className="mt-0.5 block text-slate-500 hover:underline"
              >
                Ask DMC to remove
              </button>
            )
          )}
        </>
      ) : canUpload ? (
        <button
          onClick={() => {
            setFile(null);
            setUploading(true);
          }}
          className="flex items-center gap-1 font-semibold text-amber-800 hover:underline"
        >
          <Upload className="h-3 w-3" /> Upload receiving copy
        </button>
      ) : (
        <span className="font-medium text-red-700">Receiving copy not uploaded</span>
      )}
      {(notice.receiving_uploaded_at || notice.removed_count > 0) && (
        <button
          onClick={() =>
            fetchCiReceivingLog(notice.id)
              .then(setLog)
              .catch((e) => setError(e.message))
          }
          className="mt-0.5 flex items-center gap-1 text-slate-500 hover:underline"
        >
          <History className="h-3 w-3" /> History{notice.removed_count > 0 ? ` (${notice.removed_count} removed)` : ""}
        </button>
      )}
      {error && <p className="mt-0.5 text-red-600">{error}</p>}

      {uploading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md space-y-3 rounded-xl bg-white p-5 text-sm">
            <h2 className="text-lg font-semibold">Receiving copy - {notice.notice_no}</h2>
            <p className="text-slate-500">
              Take a photo of the notice signed by the taxpayer as received, or attach it (photo or PDF). Once uploaded it can be removed
              only with the DMC&apos;s approval.
            </p>
            <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-slate-300 p-3">
              {file && <PickedFilePreview file={file.file} url={file.url} label="Receiving copy" className="h-40 w-full max-w-xs" />}
              <PhotoSourceButtons
                idBase={`ci-receiving-${notice.id}`}
                document
                hasFile={!!file}
                onFile={(files) => {
                  const f = files?.[0];
                  if (f) setFile({ file: f, url: f.type.startsWith("image/") ? URL.createObjectURL(f) : null });
                }}
              />
            </div>
            {error && <p className="text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setUploading(false)} className="rounded-md border border-slate-300 px-3 py-1.5">
                Cancel
              </button>
              <button
                disabled={busy || !file}
                onClick={async () => {
                  if (!file) return;
                  setBusy(true);
                  setError(null);
                  try {
                    await uploadCiReceiving(notice.id, file.file);
                    setUploading(false);
                    onChanged();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Could not upload.");
                  } finally {
                    setBusy(false);
                  }
                }}
                className="inline-flex items-center gap-1 rounded-md bg-nnm-blue px-3 py-1.5 font-semibold text-white disabled:opacity-60"
              >
                {busy && <Loader2 className="h-3 w-3 animate-spin" />} Upload
              </button>
            </div>
          </div>
        </div>
      )}

      {log && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setLog(null)}>
          <div className="w-full max-w-md space-y-3 rounded-xl bg-white p-5 text-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Receiving copy history - {notice.notice_no}</h2>
              <button onClick={() => setLog(null)} aria-label="Close" className="rounded p-1 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <ul className="space-y-2">
              {log.map((l) => (
                <li key={l.id} className="border-b border-slate-100 pb-2">
                  <p>
                    <b>{LOG_LABEL[l.action]}</b> - {l.by_name ?? "-"},{" "}
                    {new Date(l.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                  </p>
                  {l.reason && <p className="text-xs text-slate-600">{l.reason}</p>}
                  {l.has_removed_copy && (
                    <button
                      onClick={() => openCiRemovedCopy(l.id).catch((e) => setError(e.message))}
                      className="text-xs text-nnm-blue hover:underline"
                    >
                      View the removed copy
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

/** Status badge for a collection issue. */
export function CiStatusBadge({ status, how }: { status: "open" | "notice_issued" | "resolved"; how?: "paid" | "manual" | null }) {
  const [label, tone] =
    status === "open"
      ? ["Open - no notice yet", "bg-red-100 text-red-800"]
      : status === "notice_issued"
        ? ["Notice issued", "bg-amber-100 text-amber-800"]
        : [how === "paid" ? "Resolved - demand paid" : "Resolved", "bg-green-100 text-green-800"];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}>{label}</span>;
}
