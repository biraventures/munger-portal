"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

interface Detector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}

/**
 * Reads a QR code with the back camera. Uses the browser's own detector where it exists (Chrome on Android), else
 * decodes frames with jsQR. Calls onRead once per code; the same code is ignored for a few seconds so one ticket is
 * not sent twice while it is still in front of the camera.
 */
export function QrScanner({ onRead, paused }: { onRead: (text: string) => void; paused: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const last = useRef<{ text: string; at: number } | null>(null);
  const pausedRef = useRef(paused);
  const onReadRef = useRef(onRead);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    pausedRef.current = paused;
    onReadRef.current = onRead;
  }, [paused, onRead]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
    const detector = BD ? new BD({ formats: ["qr_code"] }) : null;

    const found = (text: string) => {
      const now = Date.now();
      if (last.current && last.current.text === text && now - last.current.at < 4000) return;
      last.current = { text, at: now };
      onReadRef.current(text);
    };

    const tick = async () => {
      if (stopped) return;
      const v = videoRef.current;
      if (v && v.readyState >= 2 && !pausedRef.current) {
        try {
          if (detector) {
            const codes = await detector.detect(v);
            if (codes[0]?.rawValue) found(codes[0].rawValue);
          } else {
            const c = canvasRef.current!;
            const w = Math.min(640, v.videoWidth);
            const h = Math.round((v.videoHeight / v.videoWidth) * w);
            c.width = w;
            c.height = h;
            const ctx = c.getContext("2d", { willReadFrequently: true })!;
            ctx.drawImage(v, 0, 0, w, h);
            const code = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" });
            if (code?.data) found(code.data);
          }
        } catch {
          /* a frame that cannot be read - try the next */
        }
      }
      raf = window.setTimeout(() => requestAnimationFrame(tick), 120) as unknown as number;
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) return setError("This browser cannot use the camera. Open the portal in Chrome.");
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (stopped) return stream.getTracks().forEach((t) => t.stop());
        const v = videoRef.current!;
        v.srcObject = stream;
        await v.play();
        tick();
      } catch (e) {
        setError(
          (e as { name?: string }).name === "NotAllowedError"
            ? "Camera permission is blocked - allow the camera for this site in the browser settings."
            : "Could not open the camera.",
        );
      }
    })();

    return () => {
      stopped = true;
      clearTimeout(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="relative mx-auto w-full max-w-sm overflow-hidden rounded-xl bg-black">
      <video ref={videoRef} playsInline muted className="aspect-square w-full object-cover" />
      <canvas ref={canvasRef} className="hidden" />
      <div className="pointer-events-none absolute inset-8 rounded-lg border-4 border-white/70" />
      {error && <p className="absolute inset-x-0 bottom-0 bg-red-700 p-2 text-center text-xs text-white">{error}</p>}
    </div>
  );
}
