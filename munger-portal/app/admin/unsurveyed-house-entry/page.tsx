"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Home } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { GpsButton, PhotoPicker } from "@/components/admin/field-capture";
import { useAdminGuard } from "@/lib/use-admin-guard";
import { createUnsurveyedHouse, prepareImageForUpload } from "@/lib/collector-field-api";

const inputClass = "w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1";

export default function UnsurveyedHouseEntryPage() {
  const admin = useAdminGuard();
  const [ward, setWard] = useState("");
  const [locality, setLocality] = useState("");
  const [address, setAddress] = useState("");
  const [houseNo, setHouseNo] = useState("");
  const [landmark, setLandmark] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [notes, setNotes] = useState("");
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

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

  async function handleSubmit() {
    setError(null);
    if (!confirmed) return setError("Please confirm that you searched the holding database and the MUNG-MIG data first.");
    if (!ward.trim()) return setError("Ward is required.");
    if (locality.trim().length < 2) return setError("Locality is required.");
    if (address.trim().length < 3) return setError("Address is required.");
    if (!gps) return setError("Capture the house's GPS location.");
    if (!photo) return setError("Take a photograph of the house.");
    setSubmitting(true);
    try {
      const img = await prepareImageForUpload(photo);
      await createUnsurveyedHouse({
        ward: ward.trim(),
        locality: locality.trim(),
        address: address.trim(),
        houseNo: houseNo.trim() || undefined,
        landmark: landmark.trim() || undefined,
        ownerName: ownerName.trim() || undefined,
        notes: notes.trim() || undefined,
        latitude: gps.lat,
        longitude: gps.lng,
        photoBase64Data: img.base64,
        photoMimeType: img.mimeType,
      });
      setSaved(true);
      setHouseNo("");
      setLandmark("");
      setOwnerName("");
      setNotes("");
      setAddress("");
      setGps(null);
      setPhoto(null);
      setConfirmed(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this house.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <Home className="h-6 w-6" />
          House Not in Records
        </h1>
        <p className="mb-6 text-sm text-slate-500">
          For a house that is in neither the holding tax database nor the MUNG-MIG data. It will be listed as <b>not yet surveyed / not in the demand register</b>.
          First search for it: use <Link href="/admin/report-property-discrepancy" className="font-semibold text-nnm-blue underline">Report Property Discrepancy</Link> (holding number, or
          &quot;Find in MUNG-MIG data&quot;).
        </p>

        {saved && (
          <div role="status" className="mb-5 flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Saved. You can enter the next house; ward and locality are kept for convenience.
          </div>
        )}

        <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-6">
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 h-4 w-4" />I searched the holding database and the MUNG-MIG data and this house is not there.
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Ward *</label>
              <input value={ward} onChange={(e) => setWard(e.target.value)} className={inputClass} inputMode="numeric" placeholder="e.g. 12" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Locality / Mohalla *</label>
              <input value={locality} onChange={(e) => setLocality(e.target.value)} className={inputClass} />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-600">Address *</label>
              <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">House number (as painted / known)</label>
              <input value={houseNo} onChange={(e) => setHouseNo(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Landmark</label>
              <input value={landmark} onChange={(e) => setLandmark(e.target.value)} className={inputClass} placeholder="e.g. opposite the temple" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Owner / occupant name (if known)</label>
              <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Any other note</label>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
            </div>
          </div>

          <GpsButton lat={gps?.lat ?? null} lng={gps?.lng ?? null} onCapture={(lat, lng) => setGps({ lat, lng })} label="Capture House GPS Location *" />
          <PhotoPicker label="Photograph of the house" file={photo} onChange={setPhoto} required />

          {error && (
            <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <button onClick={handleSubmit} disabled={submitting} className="w-full rounded-md bg-nnm-blue px-4 py-3 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60">
            {submitting ? "Saving…" : "Save House"}
          </button>
        </div>
      </main>
    </div>
  );
}
