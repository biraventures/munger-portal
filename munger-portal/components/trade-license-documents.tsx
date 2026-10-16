"use client";

import { useState } from "react";
import { FileText, Image as ImageIcon } from "lucide-react";
import type { TradeLicenseDocument } from "@/lib/trade-license-api";

/** The documents uploaded with a trade licence application, each opening in a new tab. */
export function TradeLicenseDocumentList({ documents, open }: { documents: TradeLicenseDocument[] | undefined; open: (docId: string) => Promise<void> }) {
  const [error, setError] = useState<string | null>(null);
  if (!documents?.length) return <p className="text-sm text-slate-400">No documents were uploaded with this application.</p>;
  return (
    <div>
      {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {documents.map((d) => (
          <li key={d.id}>
            <button
              type="button"
              onClick={() => open(d.id).catch((err) => setError(err instanceof Error ? err.message : "Could not open the document."))}
              className="flex w-full items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-left text-sm hover:border-nnm-blue hover:bg-blue-50"
            >
              {d.mime_type === "application/pdf" ? <FileText className="h-4 w-4 shrink-0 text-red-600" /> : <ImageIcon className="h-4 w-4 shrink-0 text-nnm-blue" />}
              <span>
                <span className="block font-medium text-slate-800">{d.label}</span>
                <span className="block text-xs text-slate-500">{d.file_name}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
