"use client";

import { useEffect, useState } from "react";
import { Download, FileText, Loader2 } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { fetchPublicDocuments, publicDocumentFileUrl, formatDocumentDate, formatFileSize, type PublicDocument } from "@/lib/public-documents-api";

export default function PublicDocumentsPage() {
  const [documents, setDocuments] = useState<PublicDocument[] | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDocuments(null);
    setError(null);
    fetchPublicDocuments(category || undefined)
      .then((r) => {
        if (cancelled) return;
        setDocuments(r.documents);
        setCategories(r.categories);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load documents.");
      });
    return () => {
      cancelled = true;
    };
  }, [category]);

  return (
    <div>
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="font-display text-3xl font-semibold text-ink">Documents &amp; Reports</h1>
        <p className="mt-2 text-sm text-ink-soft">Reports, notices, circulars and other documents published by Munger Nagar Nigam.</p>

        {categories.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-2">
            {["", ...categories].map((c) => (
              <button
                key={c || "all"}
                type="button"
                onClick={() => setCategory(c)}
                className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                  category === c ? "border-nnm-blue bg-nnm-blue text-white" : "border-line text-ink-soft hover:border-nnm-blue hover:text-nnm-blue"
                }`}
              >
                {c || "All"}
              </button>
            ))}
          </div>
        )}

        <div className="mt-6 space-y-3">
          {error && (
            <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}
          {!error && documents === null && (
            <div className="flex items-center gap-2 py-8 text-sm text-ink-soft">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          )}
          {documents?.length === 0 && <p className="py-8 text-sm text-ink-soft">No documents published{category ? ` under ${category}` : ""} yet.</p>}
          {documents?.map((d) => (
            <a
              key={d.id}
              href={publicDocumentFileUrl(d.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-4 rounded-xl border border-line bg-white p-5 transition-shadow hover:shadow-md"
            >
              <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-nnm-blue">
                <FileText className="h-5 w-5" strokeWidth={1.8} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-ink">{d.title}</span>
                {d.description && <span className="mt-1 block text-sm text-ink-soft">{d.description}</span>}
                <span className="mt-2 block text-xs text-ink-soft">
                  {d.category} · {formatDocumentDate(d.document_date)} · {formatFileSize(d.file_size)}
                </span>
              </span>
              <Download className="mt-1 h-4 w-4 shrink-0 text-ink-soft" />
            </a>
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
