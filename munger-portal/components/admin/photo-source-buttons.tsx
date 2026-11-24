"use client";

import { Camera, CheckCircle2, Paperclip } from "lucide-react";

/** File types a document box accepts from the device: a photo or a PDF. */
export const DOCUMENT_ACCEPT = "image/jpeg,image/png,application/pdf";

/**
 * How a photo box on the property tax screens gets its picture. Photos of the site, the house, the owner or a facility
 * are taken live with the camera only. A document (Aadhaar, PAN, previous receipt, land papers, register page) can
 * also be attached from the device as a photo or a PDF, since the owner often has it already.
 */
export function PhotoSourceButtons({
  idBase,
  hasFile,
  onFile,
  document,
  multiple,
}: {
  /** Unique per box - the hidden inputs are idBase-camera and idBase-file. */
  idBase: string;
  hasFile: boolean;
  onFile: (files: FileList | null) => void;
  /** A document: also offer Attach File (photo or PDF). */
  document?: boolean;
  multiple?: boolean;
}) {
  const pill = "inline-flex cursor-pointer items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold";
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFile(e.target.files);
    e.target.value = ""; // the same file / a retake fires again
  };
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {hasFile && (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Added
        </span>
      )}
      <label htmlFor={`${idBase}-camera`} className={`${pill} ${hasFile ? "bg-green-600 text-white" : "bg-nnm-blue text-white"}`}>
        <Camera className="h-3.5 w-3.5" />
        {hasFile ? "Retake" : "Take Photo"}
      </label>
      <input
        id={`${idBase}-camera`}
        type="file"
        accept="image/jpeg,image/png"
        capture="environment"
        multiple={multiple}
        className="hidden"
        onChange={pick}
      />
      {document && (
        <>
          <label htmlFor={`${idBase}-file`} className={`${pill} border border-nnm-blue bg-white text-nnm-blue`}>
            <Paperclip className="h-3.5 w-3.5" />
            Attach File (photo / PDF)
          </label>
          <input id={`${idBase}-file`} type="file" accept={DOCUMENT_ACCEPT} multiple={multiple} className="hidden" onChange={pick} />
        </>
      )}
    </div>
  );
}

/** Preview of a picked file: the picture, or a PDF badge with its name. */
export function PickedFilePreview({ file, url, label, className }: { file: File; url: string | null; label: string; className: string }) {
  if (file.type === "application/pdf") {
    return (
      <span
        className={`flex flex-col items-center justify-center gap-1 rounded-md border border-slate-200 bg-white p-1 text-center ${className}`}
      >
        <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">PDF</span>
        <span className="line-clamp-2 break-all text-[10px] text-slate-600">{file.name}</span>
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- local file preview
  return url ? <img src={url} alt={label} className={`rounded-md border border-slate-200 object-cover ${className}`} /> : null;
}
