"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, FilePlus2, Loader2, Search, XCircle } from "lucide-react";
import { OperatorHeader } from "@/components/operator-header";
import { useOperatorGuard } from "@/lib/use-operator-guard";
import { TradeLicenseDocumentList } from "@/components/trade-license-documents";
import { openOperatorTradeLicenseDocument } from "@/lib/trade-license-api";
import {
  fetchTradeLicenseApplicationByNumber,
  updateChecklistItem,
  type TradeLicenseApplicationDetail,
} from "@/lib/trade-license-api";

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1";

export default function OperatorTradeLicensePage() {
  const operator = useOperatorGuard();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<TradeLicenseApplicationDetail | null>(null);
  const [savingItemId, setSavingItemId] = useState<number | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    setDetail(null);
    try {
      const result = await fetchTradeLicenseApplicationByNumber(query.trim());
      setDetail(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not find this application.");
    } finally {
      setSearching(false);
    }
  }

  async function handleToggleChecklist(itemId: number, currentSubmitted: boolean, comments: string | null) {
    setSavingItemId(itemId);
    try {
      await updateChecklistItem(itemId, !currentSubmitted, comments);
      if (detail) {
        setDetail({
          ...detail,
          checklist: detail.checklist.map((c) => (c.id === itemId ? { ...c, submitted: !currentSubmitted } : c)),
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update this item.");
    } finally {
      setSavingItemId(null);
    }
  }

  async function handleCommentBlur(itemId: number, submitted: boolean, comments: string) {
    setSavingItemId(itemId);
    try {
      await updateChecklistItem(itemId, submitted, comments || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save comment.");
    } finally {
      setSavingItemId(null);
    }
  }

  if (!operator) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  const submittedCount = detail?.checklist.filter((c) => c.submitted).length ?? 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <OperatorHeader operator={operator} />

      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">Trade License</h1>
        <p className="mb-6 text-sm text-slate-500">
          Search by application number to check documents received, or record a new application taken offline.
        </p>

        <div className="mb-6 flex flex-col gap-3 sm:flex-row">
          <form onSubmit={handleSearch} className="flex flex-1 gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. TL-2026-00001"
              className={inputClass}
            />
            <button
              type="submit"
              disabled={searching}
              className="inline-flex shrink-0 items-center gap-2 rounded-md bg-nnm-blue px-5 py-2.5 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
            >
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Search
            </button>
          </form>
          <Link
            href="/operator/trade-license/new-entry"
            className="inline-flex shrink-0 items-center gap-2 rounded-md bg-nnm-gold px-5 py-2.5 text-sm font-semibold text-[#20240a] hover:brightness-95"
          >
            <FilePlus2 className="h-4 w-4" />
            Record Offline Application
          </Link>
        </div>

        {error && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {detail && (
          <div className="space-y-6">
            <section className="rounded-xl border border-slate-200 bg-white p-6">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-mono text-base font-semibold text-slate-900">{detail.application.application_number}</h2>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  {detail.application.status} — {detail.application.current_stage.replace(/_/g, " ")}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                <div>
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Applicant</span>
                  <span>{detail.application.applicant_name}</span>
                </div>
                <div>
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Entity</span>
                  <span>{detail.application.entity_name}</span>
                </div>
                <div>
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Type</span>
                  <span className="capitalize">{detail.application.application_type}</span>
                </div>
                <div>
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Mobile</span>
                  <span>{detail.application.mobile ?? "—"}</span>
                </div>
                <div>
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Duration</span>
                  <span>{detail.application.duration_years} year(s)</span>
                </div>
                <div>
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Requested By</span>
                  <span>{detail.application.requested_by}</span>
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="mb-4 text-base font-semibold text-slate-900">Uploaded Documents</h2>
              <TradeLicenseDocumentList documents={detail.documents} open={(docId) => openOperatorTradeLicenseDocument(detail.application.id, docId)} />
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-900">Document Checklist</h2>
                <span className="text-sm text-slate-500">{submittedCount} of {detail.checklist.length} received</span>
              </div>
              <div className="space-y-3">
                {detail.checklist.map((item) => (
                  <div key={item.id} className="rounded-md border border-slate-200 p-3">
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => handleToggleChecklist(item.id, item.submitted, item.comments)}
                        disabled={savingItemId === item.id}
                        className="mt-0.5 shrink-0"
                      >
                        {savingItemId === item.id ? (
                          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                        ) : item.submitted ? (
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                        ) : (
                          <XCircle className="h-5 w-5 text-slate-300" />
                        )}
                      </button>
                      <div className="flex-1">
                        <p className={`text-sm ${item.submitted ? "text-slate-900" : "text-slate-500"}`}>{item.document_name}</p>
                        <input
                          defaultValue={item.comments ?? ""}
                          onBlur={(e) => handleCommentBlur(item.id, item.submitted, e.target.value)}
                          placeholder="Comment (optional)"
                          className="mt-1.5 w-full rounded border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-nnm-blue"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}