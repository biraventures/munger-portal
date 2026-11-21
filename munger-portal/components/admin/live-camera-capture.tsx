"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, Loader2, RefreshCw, SwitchCamera, X } from "lucide-react";

export interface CapturedPhoto {
  /** JPEG, base64 without the data: prefix - ready for the API. */
  base64: string;
  mimeType: "image/jpeg";
  /** For showing the photo on the page. */
  dataUrl: string;
}

/** Longest side 1280 px, JPEG, with the date and time stamped in the corner. */
function grab(video: HTMLVideoElement): CapturedPhoto {
  const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const stamp = new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const size = Math.max(14, Math.round(canvas.width / 40));
  ctx.font = `bold ${size}px Arial, sans-serif`;
  const w = ctx.measureText(stamp).width;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(canvas.width - w - size * 1.2, canvas.height - size * 1.9, w + size * 1.2, size * 1.9);
  ctx.fillStyle = "#fff";
  ctx.fillText(stamp, canvas.width - w - size * 0.6, canvas.height - size * 0.6);
  // Keep under the server's 750 KB photo limit.
  let quality = 0.8;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);
  while (dataUrl.length * 0.75 > 700 * 1024 && quality > 0.3) {
    quality -= 0.1;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }
  return { base64: dataUrl.replace(/^data:image\/jpeg;base64,/, ""), mimeType: "image/jpeg", dataUrl };
}

/**
 * Takes a photo with the device camera, live on the page - there is no option to pick an existing picture from the
 * gallery or files, so the photo is taken at the spot.
 */
export function LiveCameraCapture({
  label,
  photo,
  onChange,
}: {
  label: string;
  photo: CapturedPhoto | null;
  onChange: (photo: CapturedPhoto | null) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setReady(false);
  }, []);

  const start = useCallback(
    async (mode: "environment" | "user") => {
      stop();
      setError(null);
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("This browser cannot open the camera. Use Chrome on the phone, opened over https.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: mode, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setReady(true);
      } catch {
        setError("Could not open the camera. Allow camera permission for this site and try again.");
      }
    },
    [stop],
  );

  useEffect(() => {
    if (open) void start(facing);
    else stop();
  }, [open, facing, start, stop]);

  useEffect(() => () => stop(), [stop]);

  function capture() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    onChange(grab(v));
    setOpen(false);
  }

  return (
    <div>
      <p className="mb-1 text-xs font-medium text-slate-700">{label}</p>

      {photo && !open && (
        <div className="flex items-end gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- captured photo preview */}
          <img src={photo.dataUrl} alt={label} className="h-28 w-40 rounded-md border border-green-300 object-cover" />
          <div className="space-y-1">
            <p className="flex items-center gap-1 text-xs font-semibold text-green-700">
              <CheckCircle2 className="h-3.5 w-3.5" /> Photo taken
            </p>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Retake
            </button>
          </div>
        </div>
      )}

      {!photo && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-md bg-nnm-blue px-4 py-2.5 text-sm font-semibold text-white hover:bg-nnm-blue-dark"
        >
          <Camera className="h-4 w-4" /> Open camera
        </button>
      )}

      {open && (
        <div className="rounded-lg border border-slate-300 bg-black p-2">
          <div className="relative">
            <video ref={videoRef} playsInline muted className="max-h-[60vh] w-full rounded bg-black object-contain" />
            {!ready && !error && (
              <span className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-white">
                <Loader2 className="h-4 w-4 animate-spin" /> Starting camera…
              </span>
            )}
          </div>
          {error && <p className="mt-2 rounded bg-white p-2 text-xs text-red-700">{error}</p>}
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={capture}
              disabled={!ready}
              className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-slate-900 disabled:opacity-50"
            >
              <Camera className="h-4 w-4" /> Capture
            </button>
            <button
              type="button"
              onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
              title="Switch camera"
              className="rounded-full border border-white/40 p-2.5 text-white"
            >
              <SwitchCamera className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              title="Close camera"
              className="rounded-full border border-white/40 p-2.5 text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
