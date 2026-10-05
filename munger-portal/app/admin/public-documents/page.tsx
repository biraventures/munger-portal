"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, ExternalLink, Eye, EyeOff, Loader2, Trash2, Upload } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import {
  fetchPublicDocumentsAdmin,
  uploadPublicDocument,
  updatePublicDocument,
  deletePublicDocument,
  fetchPublicDocumentBlobUrl,
  formatDocumentDate,
  formatFileSize,
  type PublicDocument,
} from "@/lib/public-documents-api";

const inputClass = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-nnm-blue focus:outline-none";
const labelClass = "mb-1 block text-xs font-semibold text-slate-600";

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function PublicDocumentsAdminPage() {
  const admin = useAdminGuard();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [documents, setDocuments] = useState<PublicDocument[] | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [allowedExtensions, setAllowedExtensions] = useState<string[]>([]);
  const [maxFileBytes, setMaxFileBytes] = useState(7 * 1024 * 1024);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Report");
  const [documentDate, setDocumentDate] = useState(todayIso());
  const [isPublished, setIsPublished] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    fetchPublicDocumentsAdmin()
      .then((r) => {
        setDocuments(r.documents);
        setCategories(r.categories);
        setAllowedExtensions(r.allowedExtensions);
        setMaxFileBytes(r.maxFileBytes);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Could not load documents."));
  }

  useEffect(() => {
    if (admin?.role === "commissioner") load();
  }, [admin]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSuccess(null);
    if (!file) {
      setFormError("Choose a file to upload.");
      return;
    }
    if (file.size > maxFileBytes) {
      setFormError(`This file is ${formatFileSize(file.size)} - the limit is ${formatFileSize(maxFileBytes)}.`);
      return;
    }
    setUploading(true);
    try {
      const doc = await uploadPublicDocument({ title, description, category, documentDate, isPublished, file });
      setSuccess(doc.is_published ? `"${doc.title}" is now live on the website.` : `"${doc.title}" was saved but is not published yet.`);
      setTitle("");
      setDescription("");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function handleView(d: PublicDocument) {
    setBusyId(d.id);
    try {
      const url = await fetchPublicDocumentBlobUrl(d.id);
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not open this document.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleTogglePublished(d: PublicDocument) {
    setBusyId(d.id);
    try {
      await updatePublicDocument(d.id, { isPublished: !d.is_published });
      load();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not update this document.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(d: PublicDocument) {
    if (!window.confirm(`Permanently delete "${d.title}"? To just hide it from the website, unpublish it instead.`)) return;
    setBusyId(d.id);
    try {
      await deletePublicDocument(d.id);
      load();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not delete this document.");
    } finally {
      setBusyId(null);
    }
  }

  if (!admin) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  if (admin.role !== "commissioner") {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <main className="mx-auto max-w-2xl px-6 py-10">
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Publishing website documents is restricted to the Municipal Commissioner.
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="mb-1 text-2xl font-semibold text-slate-900">Website Documents &amp; Reports</h1>
            <p className="text-sm text-slate-500">Upload a document and it appears on the public Documents page of the website.</p>
          </div>
          <a href="/documents" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-nnm-blue hover:underline">
            View public page <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>

        <form onSubmit={handleUpload} className="mb-8 rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="mb-4 text-base font-semibold text-slate-900">Upload a document</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelClass}>Title</label>
              <input required maxLength={300} value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder="e.g. Annual Report 2025-26" />
            </div>
            <div>
              <label className={labelClass}>Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Document date</label>
              <input required type="date" value={documentDate} onChange={(e) => setDocumentDate(e.target.value)} className={inputClass} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Short description (optional)</label>
              <textarea rows={2} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>File</label>
              <input
                ref={fileInputRef}
                type="file"
                accept={allowedExtensions.map((x) => `.${x}`).join(",")}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-nnm-blue"
              />
              <p className="mt-1 text-xs text-slate-400">
                {allowedExtensions.length > 0 ? allowedExtensions.join(", ").toUpperCase() : "PDF, Word, Excel, JPG, PNG"} · up to {formatFileSize(maxFileBytes)}
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
              <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
              Publish on the website immediately
            </label>
          </div>
          {formError && (
            <div role="alert" className="mt-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" /> {formError}
            </div>
          )}
          {success && <div className="mt-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">{success}</div>}
          <button
            type="submit"
            disabled={uploading}
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-nnm-blue px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading ? "Uploading…" : "Upload"}
          </button>
        </form>

        <h2 className="mb-3 text-base font-semibold text-slate-900">All documents</h2>
        {loadError && (
          <div role="alert" className="mb-3 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" /> {loadError}
          </div>
        )}
        {documents === null && !loadError && (
          <div className="flex items-center gap-2 py-4 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        )}
        {documents?.length === 0 && <p className="text-sm text-slate-500">Nothing uploaded yet.</p>}
        {documents && documents.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">Title</th>
                  <th className="px-4 py-2.5">Category</th>
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">Size</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {documents.map((d) => (
                  <tr key={d.id}>
                    <td className="px-4 py-3">
                      <span className="block font-medium text-slate-900">{d.title}</span>
                      <span className="block text-xs text-slate-400">
                        {d.file_name} · uploaded by {d.uploaded_by}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{d.category}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDocumentDate(d.document_date)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatFileSize(d.file_size)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          d.is_published ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {d.is_published ? "Published" : "Hidden"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-3">
                        <button type="button" disabled={busyId === d.id} onClick={() => handleView(d)} className="text-xs font-semibold text-nnm-blue hover:underline disabled:opacity-50">
                          Open
                        </button>
                        <button
                          type="button"
                          disabled={busyId === d.id}
                          onClick={() => handleTogglePublished(d)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:underline disabled:opacity-50"
                        >
                          {d.is_published ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          {d.is_published ? "Unpublish" : "Publish"}
                        </button>
                        <button
                          type="button"
                          disabled={busyId === d.id}
                          onClick={() => handleDelete(d)}
                          aria-label={`Delete ${d.title}`}
                          className="text-red-600 hover:text-red-800 disabled:opacity-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
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
