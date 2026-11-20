"use client";

import { Camera, CheckCircle2, Paperclip } from "lucide-react";

/**
 * Two ways to give a photo on the property tax screens: take it with the camera, or attach a photo already on the
 * device (gallery / files). Not used by the attendance system, which keeps live photos only.
 */
export function PhotoSourceButtons({
  idBase,
  hasFile,
  onFile,
  multiple,
  size = "sm",
}: {
  /** Unique per photo box - the two hidden inputs are idBase-camera and idBase-file. */
  idBase: string;
  hasFile: boolean;
  onFile: (files: FileList | null) => void;
  multiple?: boolean;
  size?: "sm" | "xs";
}) {
  const pill =
    size === "xs"
      ? "inline-flex cursor-pointer items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      : "inline-flex cursor-pointer items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold";
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
      <label htmlFor={`${idBase}-file`} className={`${pill} border border-nnm-blue bg-white text-nnm-blue`}>
        <Paperclip className="h-3.5 w-3.5" />
        Attach File
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
      <input id={`${idBase}-file`} type="file" accept="image/jpeg,image/png" multiple={multiple} className="hidden" onChange={pick} />
    </div>
  );
}
