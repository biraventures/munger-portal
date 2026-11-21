"use client";

import { useEffect, useState } from "react";
import { ImageOff, Loader2 } from "lucide-react";
import { getAdminToken } from "@/lib/admin-auth";
import { getAttendanceToken } from "@/lib/attendance-auth";

const API_BASE_URL = process.env.NEXT_PUBLIC_PROPERTY_TAX_API_URL || "http://localhost:4000/api/v1";

export type PhotoKind = "holding" | "aadhaar" | "receipt" | "landdoc" | "register";

export interface FieldVerificationPhotoFlags {
  id: number;
  holding_photo_path?: string | null;
  aadhaar_photo_path?: string | null;
  previous_receipt_photo_path?: string | null;
  land_document_photo_path?: string | null;
  register_photo_path?: string | null;
}

const SLOTS: { kind: PhotoKind; field: keyof FieldVerificationPhotoFlags; label: string }[] = [
  { kind: "holding", field: "holding_photo_path", label: "Holding / owner photo" },
  { kind: "receipt", field: "previous_receipt_photo_path", label: "Previous receipt" },
  { kind: "landdoc", field: "land_document_photo_path", label: "Ownership proof" },
  { kind: "aadhaar", field: "aadhaar_photo_path", label: "Aadhaar photo" },
  { kind: "register", field: "register_photo_path", label: "Demand register" },
];

function Photo({ id, kind, label }: { id: number; kind: PhotoKind; label: string }) {
  return <AuthPhoto path={`/admin/field-verifications/${id}/photo/${kind}`} label={label} />;
}

/** Photos are behind the admin login, so they are fetched with the token and shown from a blob URL. `path` is under the API base. */
/** portal: whose login fetches the photo - the admin portal (default) or asset management (attendance). */
export function AuthPhoto({
  path,
  label,
  large,
  portal = "admin",
}: {
  path: string;
  label: string;
  large?: boolean;
  portal?: "admin" | "attendance";
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [isPdf, setIsPdf] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    (async () => {
      try {
        const token = portal === "attendance" ? getAttendanceToken() : getAdminToken();
        const res = await fetch(`${API_BASE_URL}${path}`, { headers: { Authorization: `Bearer ${token ?? ""}` } });
        if (!res.ok) throw new Error();
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) {
          setIsPdf(blob.type === "application/pdf");
          setUrl(objectUrl);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, portal]);

  return (
    <figure className={large ? "w-56" : "w-36"}>
      <div
        className={`flex items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-50 ${large ? "h-44 w-56" : "h-28 w-36"}`}
      >
        {failed ? (
          <ImageOff className="h-5 w-5 text-slate-300" />
        ) : !url ? (
          <Loader2 className="h-4 w-4 animate-spin text-slate-300" />
        ) : (
          <a href={url} target="_blank" rel="noreferrer" title={isPdf ? "Open the PDF" : "Open full size"}>
            {isPdf ? (
              // A document attached as a PDF - opens in a new tab.
              <span className="flex flex-col items-center gap-1 text-xs font-semibold text-nnm-blue">
                <span className="rounded bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white">PDF</span>
                Open
              </span>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt={label} className={large ? "h-44 w-56 object-cover" : "h-28 w-36 object-cover"} />
            )}
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
