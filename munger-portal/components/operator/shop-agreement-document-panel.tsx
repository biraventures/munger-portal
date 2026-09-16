"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Clock, FileText, Loader2, Upload, XCircle } from "lucide-react";
import {
  fetchShopAgreementDocumentMeta,
  fetchShopAgreementDocumentPendingRequest,
  uploadShopAgreementDocument,
  fetchShopAgreementDocumentBlobUrl,
  type ShopAgreementDocumentMeta,
  type ShopAgreementDocumentRequest,
} from "@/lib/shop-api";
import { ADMIN_ROLE_LABELS } from "@/lib/admin-auth";

/**
 * Upload/view the signed agreement PDF for a shop. An upload never
 * becomes the live document immediately - it queues a pending
 * request that must clear Stall Prabhari -> City Manager -> Deputy
 * Commissioner first (see shopAgreementDocument.service.ts on the
 * backend). This panel shows the live document (if any) and the
 * pending request's status (if one is in flight) as two separate,
 * clearly labeled things - the previous version of this panel
 * conflated them, showing a just-uploaded pending file as if it were
 * already the live, approved document.
 */
export function ShopAgreementDocumentPanel({ shopNo }: { shopNo: string }) {
  const [meta, setMeta] = useState<ShopAgreementDocumentMeta | null | undefined>(undefined);
  const [pending, setPending] = useState<ShopAgreementDocumentRequest | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [viewing, setViewing] = useState(false);

  function load() {
    fetchShopAgreementDocumentMeta(shopNo)
      .then(setMeta)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not check for an agreement document."));
    fetchShopAgreementDocumentPendingRequest(shopNo)
      .then(setPending)
      .catch(() => setPending(null));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopNo]);

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      setError("Only PDF files are accepted.");
      e.target.value = "";
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const request = await uploadShopAgreementDocument(shopNo, file);
      setPending(request);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload this file.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleView() {
    setError(null);
    setViewing(true);
    try {
      const url = await fetchShopAgreementDocumentBlobUrl(shopNo);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open the document.");
    } finally {
      setViewing(false);
    }
  }

  const loading = meta === undefined || pending === undefined;

  return (
    <div className="border-t border-slate-100 pt-4">
      <h3 className="mb-2 text-sm font-semibold text-slate-700">Agreement Document</h3>

      {error && (
        <div role="alert" className="mb-3 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking…
        </div>
      ) : (
        <>
          {pending && pending.status === "pending" && (
            <div role="status" className="mb-3 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <Clock className="h-4 w-4 shrink-0" />
              {pending.is_change ? "A change to" : "The uploaded"} agreement document (&quot;{pending.file_name}&quot;) is awaiting approval - currently with{" "}
              {ADMIN_ROLE_LABELS[pending.current_stage]}.
            </div>
          )}
          {pending && pending.status === "rejected" && (
            <div role="alert" className="mb-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p>
                  The last uploaded document was rejected by {pending.rejected_by ? `${pending.rejected_by} (${ADMIN_ROLE_LABELS[pending.rejected_role as keyof typeof ADMIN_ROLE_LABELS] ?? pending.rejected_role})` : "a reviewer"}.
                </p>
                {pending.rejection_reason && <p className="mt-1 text-red-600">&quot;{pending.rejection_reason}&quot;</p>}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            {meta && (
              <button
                onClick={handleView}
                disabled={viewing}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                <FileText className="h-3.5 w-3.5" />
                {viewing ? "Opening…" : `View ${meta.file_name}`}
              </button>
            )}
            {!(pending && pending.status === "pending") && (
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-nnm-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-nnm-blue-dark">
                <Upload className="h-3.5 w-3.5" />
                {uploading ? "Uploading…" : meta ? "Upload a Change (PDF)" : "Upload Signed Agreement (PDF)"}
                <input type="file" accept="application/pdf" onChange={handleFileSelected} disabled={uploading} className="hidden" />
              </label>
            )}
            {meta && (
              <span className="text-xs text-slate-400">
                Approved copy uploaded by {meta.uploaded_by} on {new Date(meta.uploaded_at).toLocaleDateString("en-IN")}
              </span>
            )}
          </div>

          {!meta && !pending && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              No agreement document on file yet.
            </p>
          )}
        </>
      )}
    </div>
  );
}
