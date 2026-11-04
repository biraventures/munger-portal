"use client";

import { useState } from "react";
import { CheckCircle2, Clock, Recycle } from "lucide-react";
import { fileToBase64 } from "@/components/admin/discrepancy-capture-section";
import { saveCollectorDetails, type SolidWasteRequest } from "@/lib/admin-api";
import { shrinkPhotoFile } from "@/lib/upload-limits";

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1";

/**
 * The Tax Collector's one place for the holding's solid waste user type: shows the type on record and, from a
 * dropdown plus a photo of the facility, sends a new or corrected type to the Tax Daroga. On approval it is applied
 * to the holding and its demand notice. Needed before collection when no type is on record.
 */
export function SolidWasteTypeCard({
  holdingNo,
  currentType,
  missing,
  isBwg,
  request,
  types,
  rates,
  onSubmitted,
}: {
  holdingNo: string;
  currentType: string | null;
  missing: boolean;
  isBwg?: boolean;
  request: SolidWasteRequest | null;
  types: string[];
  rates: Record<string, number>;
  onSubmitted: () => void | Promise<void>;
}) {
  const [changing, setChanging] = useState(false);
  const [type, setType] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const pending = !!request && (request.stage === "tax_daroga" || request.stage === "city_manager");
  const showForm = !pending && (missing || changing);

  async function submit() {
    if (!type) return setError("Select the solid waste user type.");
    if (!missing && type === currentType) return setError("This is already the holding's user type - select a different one.");
    if (!photo) return setError("Take a photo of the facility, for the Tax Daroga to verify the type.");
    setSaving(true);
    setError(null);
    try {
      await saveCollectorDetails(holdingNo, {
        solidWasteChargeType: type,
        facilityPhotoBase64Data: await fileToBase64(photo),
        facilityPhotoMimeType: photo.type,
      });
      setDone(`"${type}" sent to the Tax Daroga for approval.`);
      setType("");
      setPhoto(null);
      setChanging(false);
      await onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the user type.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`rounded-xl border p-5 ${missing ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"}`}>
      <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-800">
        <Recycle className="h-4 w-4" />
        Solid waste user type
      </h3>
      <p className="text-sm text-slate-700">
        On record:{" "}
        {missing ? (
          <b className="text-red-700">Not known - required before collecting payment</b>
        ) : (
          <b>
            {isBwg ? "Bulk waste generator (no user charge)" : currentType}
            {!isBwg && currentType && rates[currentType] !== undefined ? ` - ₹${rates[currentType]}/month` : ""}
          </b>
        )}
      </p>

      {pending && request && (
        <p className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-white p-3 text-xs text-amber-900">
          <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            <b>{request.requested_type}</b> sent by {request.requested_by_display_name} - waiting for the Tax Daroga&apos;s approval.
            {missing ? " Payment can be collected once it is approved." : " Until then the type on record stays as it is."}
          </span>
        </p>
      )}
      {!pending && request?.stage === "rejected" && (
        <p className="mt-3 rounded-md border border-red-200 bg-white p-3 text-xs text-red-700">
          The last entry ({request.requested_type}) was rejected by {request.rejected_by}: {request.reject_reason}
        </p>
      )}
      {done && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-green-700">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {done}
        </p>
      )}

      {!pending && !missing && !changing && !isBwg && (
        <button
          type="button"
          onClick={() => setChanging(true)}
          className="mt-3 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          Type is wrong? Change it
        </button>
      )}

      {showForm && (
        <div className="mt-3 space-y-3">
          <label className="block text-xs font-medium text-slate-700">
            {missing ? "Select the user type" : "Correct user type"} (the Tax Daroga approves it; the charge is set automatically)
            <select value={type} onChange={(e) => setType(e.target.value)} className={`${inputClass} mt-1`}>
              <option value="">Select user type…</option>
              {types.map((t) => (
                <option key={t} value={t} disabled={!missing && t === currentType}>
                  {t} - ₹{rates[t] ?? 0}/month
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-slate-700">
            Photo of the facility (shop, house, hotel, etc.) - required
            <input
              type="file"
              accept="image/jpeg,image/png"
              capture="environment"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                setPhoto(f ? await shrinkPhotoFile(f) : null);
              }}
              className="mt-1 block w-full text-xs text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-nnm-blue file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white"
            />
          </label>
          {photo && <p className="text-xs text-green-700">Photo attached: {photo.name}</p>}
          {error && (
            <p role="alert" className="text-xs text-red-600">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={saving}
              className="rounded-md bg-nnm-blue px-4 py-2 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
            >
              {saving ? "Sending…" : "Send to Tax Daroga for approval"}
            </button>
            {!missing && (
              <button
                type="button"
                onClick={() => {
                  setChanging(false);
                  setError(null);
                }}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
