"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Camera, CheckCircle2, FileCheck2, RotateCcw, Search } from "lucide-react";
import { MobileHoldingLookup } from "@/components/mobile-holding-lookup";
import { AdminHeader } from "@/components/admin-header";
import { GpsButton } from "@/components/admin/field-capture";
import { useAdminGuard } from "@/lib/use-admin-guard";
import { sanitizeHoldingNoInput } from "@/lib/holding-no";
import { fetchNoticesForReceiving, prepareImageForUpload, uploadReceivingCopy, type NoticeForReceiving } from "@/lib/collector-field-api";
import {
  EMPTY_WATER,
  WaterStatusField,
  waterStatusError,
  waterStatusPayload,
  type WaterStatusValue,
} from "@/components/admin/water-status-field";

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1";

export default function NoticeReceivingUploadPage() {
  const admin = useAdminGuard();
  const [holdingNo, setHoldingNo] = useState("");
  const [searching, setSearching] = useState(false);
  const [property, setProperty] = useState<{
    owner_name: string;
    address: string | null;
    ward: string | null;
    water_connection_status?: string | null;
  } | null>(null);
  const [water, setWater] = useState<WaterStatusValue>(EMPTY_WATER);
  const [notices, setNotices] = useState<NoticeForReceiving[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cameraKey, setCameraKey] = useState(0);
  useEffect(() => {
    if (!photo) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  if (!admin) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  if (admin.role !== "tax_collector") {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <main className="mx-auto max-w-2xl px-6 py-10">
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            This is restricted to the Tax Collector.
          </div>
        </main>
      </div>
    );
  }

  async function runSearch(value: string) {
    if (!value.trim()) return;
    setSearching(true);
    setError(null);
    setDone(null);
    setProperty(null);
    setNotices([]);
    setSelected(null);
    try {
      const result = await fetchNoticesForReceiving(value.trim());
      if (!result) {
        setError("No holding found with that number.");
        return;
      }
      setProperty(result.property);
      setNotices(result.notices);
      const firstOpen = result.notices.find((n) => n.copies_uploaded < 1);
      setSelected(firstOpen?.demand_no ?? null);
      setPhoto(null);
      setWater(EMPTY_WATER);
      if (result.notices.length === 0)
        setError(
          "This holding has no pending demand notice (none generated yet, or the latest one is already paid or replaced by a newer reminder).",
        );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setSearching(false);
    }
  }

  async function handleUpload() {
    if (uploading) return; // one tap = one upload
    if (!selected) return setError("Choose the demand notice this copy belongs to.");
    if (!photo) return setError("Take a photo of the signed receiving slip.");
    const waterErr = waterStatusError(water);
    if (waterErr) return setError(waterErr);
    setUploading(true);
    setError(null);
    try {
      const img = await prepareImageForUpload(photo);
      await uploadReceivingCopy(selected, {
        photoBase64Data: img.base64,
        photoMimeType: img.mimeType,
        gpsLat: gps?.lat,
        gpsLng: gps?.lng,
        ...waterStatusPayload(water),
      });
      setDone(`Receiving copy uploaded for notice ${selected}. Only one copy is kept per notice, and it cannot be changed or removed.`);
      setPhoto(null);
      setGps(null);
      setWater(EMPTY_WATER);
      await runSearchKeepDone(holdingNo.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload this copy.");
    } finally {
      setUploading(false);
    }
  }

  /** Refreshes the notice list (copy counts) without clearing the success message. */
  async function runSearchKeepDone(value: string) {
    const result = await fetchNoticesForReceiving(value);
    if (!result) return;
    setProperty(result.property);
    setNotices(result.notices);
    const firstOpen = result.notices.find((n) => n.copies_uploaded < 1);
    setSelected(firstOpen?.demand_no ?? null);
  }

  const selectedNotice = notices.find((n) => n.demand_no === selected);

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <FileCheck2 className="h-6 w-6" />
          Upload Notice Receiving Copy
        </h1>
        <p className="mb-6 text-sm text-slate-500">
          After delivering a printed demand notice, photograph the receiving slip torn from its foot, signed by the receiver, and upload it
          here. <b>One receiving copy</b> per notice: check the photo before uploading and retake it if it is blurred or cut off - once
          uploaded it <b>cannot be changed or removed</b> by anyone.
        </p>

        {done && (
          <div
            role="status"
            className="mb-5 flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {done}
          </div>
        )}

        <div className="mb-6 flex items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-500">Holding number</label>
            <input
              value={holdingNo}
              onChange={(e) => setHoldingNo(sanitizeHoldingNoInput(e.target.value))}
              onKeyDown={(e) => e.key === "Enter" && runSearch(holdingNo)}
              className={inputClass}
              placeholder="e.g. MUNG-00123"
            />
          </div>
          <button
            onClick={() => runSearch(holdingNo)}
            disabled={searching || !holdingNo.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-nnm-blue px-5 py-2.5 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
          >
            <Search className="h-4 w-4" />
            {searching ? "Searching…" : "Search"}
          </button>
        </div>

        <div className="-mt-3 mb-6">
          <MobileHoldingLookup
            as="admin"
            onPick={(h) => {
              setHoldingNo(h);
              void runSearch(h);
            }}
          />
        </div>

        {error && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {property && notices.length > 0 && (
          <div className="space-y-5">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="mb-3 text-sm text-slate-600">
                <span className="font-semibold text-slate-800">{property.owner_name}</span>
                {property.ward ? ` - Ward ${property.ward}` : ""}
                {property.address ? ` - ${property.address}` : ""}
              </p>
              <p className="mb-2 text-xs font-medium text-slate-500">Which demand notice is this copy for?</p>
              <div className="space-y-2">
                {notices.map((n) => {
                  const full = n.copies_uploaded >= 1;
                  return (
                    <label
                      key={n.demand_no}
                      className={`flex items-center justify-between gap-3 rounded-lg border p-3 text-sm ${full ? "border-slate-200 bg-slate-50 text-slate-400" : selected === n.demand_no ? "border-nnm-blue bg-blue-50" : "cursor-pointer border-slate-200 hover:bg-slate-50"}`}
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="notice"
                          disabled={full}
                          checked={selected === n.demand_no}
                          onChange={() => setSelected(n.demand_no)}
                        />
                        <span>
                          <b>{n.demand_no}</b> - {new Date(n.notice_date).toLocaleDateString("en-IN")} - ₹{n.total_amount_demanded}
                          {n.superseded ? " (replaced by a newer notice)" : ""}
                          {n.settled ? " (paid)" : ""}
                        </span>
                      </span>
                      <span className="text-xs">{full ? "Receiving uploaded" : "Not uploaded"}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {selectedNotice && (
              <div className="space-y-4 rounded-xl border-2 border-nnm-blue bg-white p-5">
                {/* key: a fresh input after Retake, so choosing the camera again always fires */}
                <input
                  key={cameraKey}
                  id="receiving-photo"
                  type="file"
                  accept="image/jpeg,image/png"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
                />
                {!photo ? (
                  <label
                    htmlFor="receiving-photo"
                    className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-nnm-blue/40 bg-blue-50/50 p-6 text-center"
                  >
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-nnm-blue shadow-sm">
                      <Camera className="h-5 w-5" />
                    </span>
                    <span className="text-sm font-semibold text-slate-800">Take photo of the signed receiving slip</span>
                    <span className="text-xs text-slate-500">Notice number, receiver&apos;s signature and date must be readable.</span>
                  </label>
                ) : (
                  <div>
                    <p className="mb-2 text-sm font-medium text-slate-700">
                      Check the photo: is the notice number, signature and date clearly readable?
                    </p>
                    {previewUrl && (
                      // eslint-disable-next-line @next/next/no-img-element -- local file preview
                      <img
                        src={previewUrl}
                        alt="Receiving slip photo"
                        className="mb-3 max-h-[60vh] w-full rounded-md border border-slate-200 object-contain"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setPhoto(null);
                        setCameraKey((k) => k + 1);
                      }}
                      disabled={uploading}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                    >
                      <RotateCcw className="h-4 w-4" /> Retake photo
                    </button>
                  </div>
                )}
                <WaterStatusField value={water} onChange={setWater} lastRecorded={property?.water_connection_status ?? null} />
                <GpsButton
                  lat={gps?.lat ?? null}
                  lng={gps?.lng ?? null}
                  onCapture={(lat, lng) => setGps({ lat, lng })}
                  label="Add my location (recommended)"
                />
                <button
                  onClick={handleUpload}
                  disabled={uploading || !photo || !!waterStatusError(water)}
                  className="w-full rounded-md bg-nnm-blue px-4 py-3 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
                >
                  {uploading ? "Uploading…" : "Upload this receiving copy"}
                </button>
                <p className="text-xs text-slate-400">Only one copy per notice. After upload it cannot be retaken, changed or removed.</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
