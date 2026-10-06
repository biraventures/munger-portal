"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2, ExternalLink, FileUp, Loader2 } from "lucide-react";
import {
  decideManagedDocument,
  fetchDocumentMe,
  fetchManagedDocuments,
  openManagedDocument,
  uploadManagedDocument,
  type DocumentLogin,
  type DocumentMe,
  type ManagedDocument,
} from "@/lib/document-manager-api";
import { formatDocumentDate, formatFileSize } from "@/lib/public-documents-api";

const inputClass = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-nnm-blue focus:outline-none";
const BACK: Record<DocumentLogin, string> = { admin: "/admin/dashboard", operator: "/operator/dashboard", attendance: "/attendance/dashboard" };

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function Badge({ d }: { d: ManagedDocument }) {
  const map = {
    pending: "bg-amber-100 text-amber-800",
    approved: d.is_published ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600",
    rejected: "bg-red-100 text-red-700",
  } as const;
  const label = d.approval_status === "pending" ? "Waiting for APSWMO approval" : d.approval_status === "rejected" ? "Rejected" : d.is_published ? "Published" : "Not published";
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${map[d.approval_status]}`}>{label}</span>;
}

function Inner() {
  const params = useSearchParams();
  const as = (["admin", "operator", "attendance"].includes(params.get("as") ?? "") ? params.get("as") : "admin") as DocumentLogin;
  const fileRef = useRef<HTMLInputElement>(null);
  const [me, setMe] = useState<DocumentMe | null>(null);
  const [docs, setDocs] = useState<ManagedDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Report");
  const [documentDate, setDocumentDate] = useState(todayIso());
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    try {
      setMe(await fetchDocumentMe(as));
      setDocs(await fetchManagedDocuments(as));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load.");
    }
  }, [as]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!me) return;
    if (!file) return setError("Choose a file to upload.");
    if (file.size > me.maxFileBytes) return setError(`File is too large (limit ${formatFileSize(me.maxFileBytes)}).`);
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      await uploadManagedDocument(as, { title, description, category, documentDate, file });
      setMsg(me.needsApproval ? "Uploaded. It will appear on the website once the APSWMO approves it." : "Uploaded and published.");
      setTitle("");
      setDescription("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload.");
    } finally {
      setBusy(false);
    }
  }

  async function decide(id: string, action: "approve" | "reject") {
    if (action === "reject" && reason.trim().length < 3) return setError("Please give a reason for rejecting.");
    setBusy(true);
    setError(null);
    try {
      await decideManagedDocument(as, id, action, reason.trim() || undefined);
      setRejectingId(null);
      setReason("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record this decision.");
    } finally {
      setBusy(false);
    }
  }

  const pending = (docs ?? []).filter((d) => d.approval_status === "pending");

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <h1 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <FileUp className="h-5 w-5" /> Website Documents
          </h1>
          <Link href={BACK[as]} className="text-sm text-nnm-blue hover:underline">
            ← Back to dashboard
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-8">
        {error && (
          <div role="alert" className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}
        {msg && (
          <div className="mb-4 flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" /> {msg}
          </div>
        )}
        {!me ? (
          !error && <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        ) : (
          <>
            {me.canApprove && (
              <section className="mb-8 rounded-xl border border-amber-300 bg-amber-50 p-5">
                <h2 className="mb-3 text-sm font-semibold text-amber-900">Waiting for your approval ({pending.length})</h2>
                {pending.length === 0 ? (
                  <p className="text-sm text-amber-800">Nothing is waiting.</p>
                ) : (
                  <ul className="space-y-3">
                    {pending.map((d) => (
                      <li key={d.id} className="rounded-md border border-amber-200 bg-white p-3 text-sm">
                        <p className="font-semibold text-slate-900">{d.title}</p>
                        <p className="text-xs text-slate-500">
                          {d.category} · {formatDocumentDate(d.document_date)} · {d.file_name} ({formatFileSize(d.file_size)}) · uploaded by {d.uploaded_by}
                        </p>
                        {d.description && <p className="mt-1 text-xs text-slate-600">{d.description}</p>}
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <button onClick={() => openManagedDocument(as, d.id).catch((e) => setError(e.message))} className="inline-flex items-center gap-1 rounded border border-nnm-blue px-2 py-1 text-xs font-semibold text-nnm-blue">
                            <ExternalLink className="h-3 w-3" /> Open to review
                          </button>
                          <button onClick={() => decide(d.id, "approve")} disabled={busy} className="rounded bg-nnm-blue px-3 py-1 text-xs font-semibold text-white disabled:opacity-60">
                            Approve &amp; publish
                          </button>
                          {rejectingId === d.id ? (
                            <>
                              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" className="rounded border border-slate-300 px-2 py-1 text-xs" />
                              <button onClick={() => decide(d.id, "reject")} disabled={busy} className="rounded bg-red-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-60">
                                Confirm reject
                              </button>
                            </>
                          ) : (
                            <button onClick={() => { setRejectingId(d.id); setReason(""); }} className="rounded border border-red-300 px-3 py-1 text-xs font-semibold text-red-700">
                              Reject
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            <section className="mb-8 rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="mb-1 text-sm font-semibold text-slate-800">Upload a document</h2>
              <p className="mb-4 text-xs text-slate-500">
                {me.needsApproval ? "Your upload is shown on the public website only after the APSWMO approves it." : "Your upload is published on the public website straight away."}
              </p>
              <form onSubmit={handleUpload} className="space-y-3">
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" required className={inputClass} />
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" rows={2} className={inputClass} />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
                    {me.categories.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                  <input type="date" value={documentDate} onChange={(e) => setDocumentDate(e.target.value)} required className={inputClass} />
                </div>
                <input ref={fileRef} type="file" accept={me.allowedExtensions.map((x) => `.${x}`).join(",")} onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
                <p className="text-xs text-slate-400">Allowed: {me.allowedExtensions.join(", ")} · up to {formatFileSize(me.maxFileBytes)}</p>
                <button type="submit" disabled={busy} className="rounded-md bg-nnm-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                  {busy ? "Uploading…" : "Upload"}
                </button>
              </form>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="mb-3 text-sm font-semibold text-slate-800">{me.canApprove || me.role === "commissioner" || me.role === "municipal_commissioner" ? "All documents" : "Your uploads"}</h2>
              {!docs ? (
                <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
              ) : docs.length === 0 ? (
                <p className="text-sm text-slate-400">No documents yet.</p>
              ) : (
                <ul className="space-y-2">
                  {docs.map((d) => (
                    <li key={d.id} className="rounded-md border border-slate-200 p-3 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-slate-800">{d.title}</span>
                        <Badge d={d} />
                      </div>
                      <p className="mt-0.5 text-slate-500">
                        {d.category} · {formatDocumentDate(d.document_date)} · {d.file_name} · by {d.uploaded_by}
                      </p>
                      {d.approval_status === "rejected" && d.reject_reason && <p className="mt-1 text-red-700">Rejected by {d.approved_by}: {d.reject_reason}</p>}
                      <button onClick={() => openManagedDocument(as, d.id).catch((e) => setError(e.message))} className="mt-1 text-nnm-blue hover:underline">
                        Open
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

export default function DocumentUploadPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>}>
      <Inner />
    </Suspense>
  );
}
