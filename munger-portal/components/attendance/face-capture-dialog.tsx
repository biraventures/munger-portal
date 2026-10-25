"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Camera, CheckCircle2, Loader2, RefreshCw, SwitchCamera, X, XCircle } from "lucide-react";
import { useAttendanceLang } from "@/lib/attendance-i18n";
import { createFaceChallenge, submitFaceEnrol, submitFacePunch, type FaceChallenge, type FacePurpose } from "@/lib/face-attendance-api";

const STRINGS = {
  en: {
    titleIn: "Face check - Mark In",
    titleOut: "Face check - Mark Out",
    titleEnrol: "Enrol face",
    starting: "Starting camera...",
    cameraError: "Could not open the camera. Allow camera permission for this site (and for the app).",
    consentText:
      "I have explained to the worker that their face photo will be used only for attendance, kept by Nagar Nigam Munger, and deleted when they leave service, and the worker has agreed.",
    consentNext: "Worker agrees - continue",
    step1: "Step 1 of 2: Ask the worker to look straight at the camera.",
    step2Left: "Step 2 of 2: Ask the worker to turn their head to THEIR LEFT.",
    step2Right: "Step 2 of 2: Ask the worker to turn their head to THEIR RIGHT.",
    tip: "Only the worker in the frame, face clearly visible, good light, no cap or mask.",
    capture: "Capture",
    checking: "Checking face...",
    verifiedIn: "Face verified - marked IN",
    verifiedOut: "Face verified - marked OUT",
    enrolled: "Face enrolled",
    notVerified: "Not verified",
    tryAgain: "Try again",
    manual: "Mark manually instead",
    manualHint: "Only if face check is not possible (camera fault, injury, server down). Give the reason - this mark goes to the Sanitation Officer for review.",
    reasonPlaceholder: "Reason for marking without face check",
    submitManual: "Mark manually",
    close: "Close",
    switchCamera: "Switch camera",
  },
  hi: {
    titleIn: "चेहरा जाँच - इन मार्क करें",
    titleOut: "चेहरा जाँच - आउट मार्क करें",
    titleEnrol: "चेहरा पंजीकरण",
    starting: "कैमरा शुरू हो रहा है...",
    cameraError: "कैमरा नहीं खुल सका। इस साइट (और ऐप) को कैमरा अनुमति दें।",
    consentText:
      "मैंने कर्मचारी को समझा दिया है कि उसके चेहरे की फ़ोटो केवल हाज़िरी के लिए उपयोग होगी, नगर निगम मुंगेर के पास रहेगी, और सेवा छोड़ने पर हटा दी जाएगी, और कर्मचारी सहमत है।",
    consentNext: "कर्मचारी सहमत है - आगे बढ़ें",
    step1: "चरण 1/2: कर्मचारी को सीधे कैमरे की ओर देखने को कहें।",
    step2Left: "चरण 2/2: कर्मचारी को अपना सिर अपनी बाईं ओर घुमाने को कहें।",
    step2Right: "चरण 2/2: कर्मचारी को अपना सिर अपनी दाईं ओर घुमाने को कहें।",
    tip: "फ्रेम में केवल कर्मचारी, चेहरा साफ़ दिखे, अच्छी रोशनी, टोपी या मास्क नहीं।",
    capture: "फ़ोटो लें",
    checking: "चेहरा जाँचा जा रहा है...",
    verifiedIn: "चेहरा सत्यापित - इन मार्क हुआ",
    verifiedOut: "चेहरा सत्यापित - आउट मार्क हुआ",
    enrolled: "चेहरा पंजीकृत हुआ",
    notVerified: "सत्यापित नहीं हुआ",
    tryAgain: "फिर से प्रयास करें",
    manual: "इसके बजाय मैन्युअल मार्क करें",
    manualHint: "केवल तब जब चेहरा जाँच संभव न हो (कैमरा खराब, चोट, सर्वर बंद)। कारण लिखें - यह मार्क स्वच्छता पदाधिकारी के पास समीक्षा के लिए जाएगा।",
    reasonPlaceholder: "चेहरा जाँच के बिना मार्क करने का कारण",
    submitManual: "मैन्युअल मार्क करें",
    close: "बंद करें",
    switchCamera: "कैमरा बदलें",
  },
};

type Step = "consent" | "front" | "turn" | "checking" | "done" | "failed" | "manual";

export interface FaceCaptureDialogProps {
  staffId: number;
  staffName: string;
  purpose: FacePurpose;
  onClose: () => void;
  /** Called after a successful face punch / enrolment. */
  onDone: () => void;
  /** Punch only: mark by hand with a reason (flagged for review). Omit to hide the option. */
  onManual?: (reason: string) => Promise<void>;
}

/** Longest side 720 px, JPEG - plenty for face matching and small to upload on mobile data. */
function grab(video: HTMLVideoElement): string {
  const scale = Math.min(1, 720 / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85).replace(/^data:image\/jpeg;base64,/, "");
}

export function FaceCaptureDialog({ staffId, staffName, purpose, onClose, onDone, onManual }: FaceCaptureDialogProps) {
  const { lang } = useAttendanceLang();
  const s = STRINGS[lang];
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [cameraReady, setCameraReady] = useState(false);
  const [challenge, setChallenge] = useState<FaceChallenge | null>(null);
  const [step, setStep] = useState<Step>(purpose === "enrol" ? "consent" : "front");
  const [front, setFront] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraReady(false);
  }, []);

  const startCamera = useCallback(async (mode: "environment" | "user") => {
    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: mode, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setCameraReady(true);
    } catch {
      setError(s.cameraError);
    }
  }, [s.cameraError, stopCamera]);

  const newChallenge = useCallback(async () => {
    setChallenge(null);
    setFront(null);
    setMessage(null);
    setError(null);
    try {
      setChallenge(await createFaceChallenge(staffId, purpose));
      setStep(purpose === "enrol" && step === "consent" ? "consent" : "front");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [staffId, purpose, step]);

  useEffect(() => {
    void newChallenge();
    return () => stopCamera();
    // run once on open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (step === "front" || step === "turn") {
      if (!streamRef.current) void startCamera(facing);
    } else if (step !== "checking") {
      stopCamera();
    }
  }, [step, facing, startCamera, stopCamera]);

  async function capture() {
    const v = videoRef.current;
    if (!v || !challenge || !v.videoWidth) return;
    const img = grab(v);
    if (step === "front") {
      setFront(img);
      setStep("turn");
      return;
    }
    setStep("checking");
    stopCamera();
    try {
      if (purpose === "enrol") {
        await submitFaceEnrol(challenge.challengeId, front!, img, true);
        setMessage(s.enrolled);
        setStep("done");
      } else {
        const r = await submitFacePunch(challenge.challengeId, front!, img);
        if (r.verified) {
          setMessage(`${purpose === "in" ? s.verifiedIn : s.verifiedOut}${r.inTime ? ` (${r.inTime})` : r.outTime ? ` (${r.outTime})` : ""}`);
          setStep("done");
        } else {
          setMessage(r.reason ?? s.notVerified);
          setStep("failed");
        }
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
      setStep("failed");
    }
  }

  async function retry() {
    setStep("front");
    await newChallenge();
  }

  async function manual() {
    if (!onManual || reason.trim().length < 5) return;
    setBusy(true);
    setError(null);
    try {
      await onManual(reason.trim());
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (step !== "done") return;
    const t = setTimeout(onDone, 1500);
    return () => clearTimeout(t);
  }, [step, onDone]);

  const title = purpose === "enrol" ? s.titleEnrol : purpose === "in" ? s.titleIn : s.titleOut;
  const showVideo = step === "front" || step === "turn";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="max-h-[100dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            <p className="text-sm text-slate-600">{staffName}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-slate-100" aria-label={s.close}>
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && <p className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        {step === "consent" && !error && (
          <div>
            <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{s.consentText}</p>
            <button
              onClick={() => setStep("front")}
              disabled={!challenge}
              className="w-full rounded-md bg-nnm-blue px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {s.consentNext}
            </button>
          </div>
        )}

        <div className={showVideo && !error ? "" : "hidden"}>
          <p className="mb-2 text-sm font-medium text-slate-800">
            {step === "front" ? s.step1 : challenge?.direction === "left" ? s.step2Left : s.step2Right}
          </p>
          <div className="relative mb-2 overflow-hidden rounded-lg bg-black">
            <video ref={videoRef} autoPlay playsInline muted className="aspect-[3/4] w-full object-cover" />
            {!cameraReady && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {s.starting}
              </div>
            )}
            {step === "turn" && challenge && (
              <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
                <span className="flex items-center gap-1 rounded-full bg-amber-400 px-3 py-1 text-sm font-bold text-slate-900 shadow">
                  {/* Rear camera (holder's view): the worker's left is on the right of the screen. No arrow on the
                      front camera, where the worker sees the screen and an arrow would point the "wrong" way. */}
                  {facing === "environment" && (challenge.direction === "left" ? <ArrowRight className="h-5 w-5" /> : <ArrowLeft className="h-5 w-5" />)}
                  {challenge.direction === "left" ? (lang === "hi" ? "बाएँ" : "LEFT") : lang === "hi" ? "दाएँ" : "RIGHT"}
                </span>
              </div>
            )}
          </div>
          <p className="mb-3 text-xs text-slate-500">{s.tip}</p>
          <div className="flex gap-2">
            <button
              onClick={capture}
              disabled={!cameraReady || !challenge}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-nnm-blue px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              <Camera className="h-4 w-4" /> {s.capture}
            </button>
            <button
              onClick={() => {
                const next = facing === "environment" ? "user" : "environment";
                setFacing(next);
                void startCamera(next);
              }}
              className="rounded-md border border-slate-300 px-3 py-2.5 text-slate-600"
              aria-label={s.switchCamera}
              title={s.switchCamera}
            >
              <SwitchCamera className="h-4 w-4" />
            </button>
          </div>
        </div>

        {step === "checking" && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin" /> {s.checking}
          </div>
        )}

        {step === "done" && (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-600" />
            <p className="text-sm font-semibold text-green-800">{message}</p>
          </div>
        )}

        {step === "failed" && (
          <div className="py-2">
            <div className="mb-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <b>{s.notVerified}:</b> {message}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              <button onClick={retry} className="inline-flex items-center justify-center gap-1.5 rounded-md bg-nnm-blue px-3 py-2.5 text-sm font-semibold text-white">
                <RefreshCw className="h-4 w-4" /> {s.tryAgain}
              </button>
              {onManual && (
                <button onClick={() => setStep("manual")} className="rounded-md border border-slate-300 px-3 py-2.5 text-sm font-semibold text-slate-700">
                  {s.manual}
                </button>
              )}
            </div>
          </div>
        )}

        {step === "manual" && onManual && (
          <div>
            <p className="mb-2 text-xs text-slate-600">{s.manualHint}</p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={300}
              rows={3}
              placeholder={s.reasonPlaceholder}
              className="mb-3 w-full rounded-md border border-slate-300 p-2 text-sm"
            />
            <button
              onClick={manual}
              disabled={busy || reason.trim().length < 5}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-amber-600 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} {s.submitManual}
            </button>
          </div>
        )}

        {/* Manual marking also offered up front, when even the photo session could not start. */}
        {error && step !== "manual" && onManual && (
          <button onClick={() => { setError(null); setStep("manual"); }} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm font-semibold text-slate-700">
            {s.manual}
          </button>
        )}
      </div>
    </div>
  );
}
