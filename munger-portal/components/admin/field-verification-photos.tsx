"use client";

import { useEffect, useState } from "react";
import { ImageOff, Loader2 } from "lucide-react";
import { getAdminToken } from "@/lib/admin-auth";

const API_BASE_URL = process.env.NEXT_PUBLIC_PROPERTY_TAX_API_URL || "http://localhost:4000/api/v1";

export type PhotoKind = "holding" | "aadhaar" | "receipt" | "landdoc";

export interface FieldVerificationPhotoFlags {
  id: number;
  holding_photo_path?: string | null;
  aadhaar_photo_path?: string | null;
  previous_receipt_photo_path?: string | null;
  land_document_photo_path?: string | null;
}

const SLOTS: { kind: PhotoKind; field: keyof FieldVerificationPhotoFlags; label: string }[] = [
  { kind: "holding", field: "holding_photo_path", label: "Holding / owner photo" },
  { kind: "receipt", field: "previous_receipt_photo_path", label: "Previous receipt" },
  { kind: "landdoc", field: "land_document_photo_path", label: "Ownership proof" },
  { kind: "aadhaar", field: "aadhaar_photo_path", label: "Aadhaar photo" },
];

/** Photos are behind the admin login, so they are fetched with the token and shown from a blob URL. */
function Photo({ id, kind, label }: { id: number; kind: PhotoKind; label: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    (async () => {
      try {
        const token = getAdminToken();
        const res = await fetch(`${API_BASE_URL}/admin/field-verifications/${id}/photo/${kind}`, { headers: { Authorization: `Bearer ${token ?? ""}` } });
        if (!res.ok) throw new Error();
        objectUrl = URL.createObjectURL(await res.blob());
        if (!cancelled) setUrl(objectUrl);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, kind]);

  return (
    <figure className="w-36">
      <div className="flex h-28 w-36 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-50">
        {failed ? (
          <ImageOff className="h-5 w-5 text-slate-300" />
        ) : !url ? (
          <Loader2 className="h-4 w-4 animate-spin text-slate-300" />
        ) : (
          <a href={url} target="_blank" rel="noreferrer" title="Open full size">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={label} className="h-28 w-36 object-cover" />
          </a>
        )}
      </div>
      <figcaption className="mt-1 text-[11px] text-slate-500">{label}</figcaption>
    </figure>
  );
}

/** The photos attached to one field-verification capture (only those actually taken). */
export function FieldVerificationPhotos({ visit }: { visit: FieldVerificationPhotoFlags }) {
  const present = SLOTS.filter((s) => !!visit[s.field]);
  if (present.length === 0) return <p className="mt-2 text-slate-400">No photos were taken on this visit.</p>;
  return (
    <div className="mt-2 flex flex-wrap gap-3">
      {present.map((s) => (
        <Photo key={s.kind} id={visit.id} kind={s.kind} label={s.label} />
      ))}
    </div>
  );
}
