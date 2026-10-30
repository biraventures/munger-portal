"use client";

import { useState } from "react";
import { Eye, Loader2 } from "lucide-react";
import { ADMIN_ROLE_LABELS, getAdminToken, type AdminRole } from "@/lib/admin-auth";
import { waterStatusLabel } from "./water-status-field";
import { FieldVerificationPhotos, type FieldVerificationPhotoFlags } from "./field-verification-photos";

const API_BASE_URL = process.env.NEXT_PUBLIC_PROPERTY_TAX_API_URL || "http://localhost:4000/api/v1";

/** Officers who may open the full Aadhaar number (each view is logged on the server). */
export const AADHAAR_VIEW_ROLES = [
  "tax_daroga",
  "agency_team_leader",
  "agency_project_manager",
  "city_manager",
  "deputy_commissioner",
  "commissioner",
];

export interface FieldVisit extends FieldVerificationPhotoFlags {
  captured_by_display_name: string;
  captured_by_role: string;
  captured_at: string;
  gps_lat: string | null;
  gps_lng: string | null;
  /** Masked by the API (XXXX XXXX 1234). */
  aadhaar_number?: string | null;
  water_connection_status?: string | null;
  water_connection_count?: number | null;
}

const when = (v: string) =>
  new Date(v).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/** One Tax Collector field visit: who took it and when, GPS, Aadhaar (masked, full number on request) and the photos. */
export function FieldVisitCard({ visit, viewerRole }: { visit: FieldVisit; viewerRole?: string }) {
  const [full, setFull] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canReveal = !!viewerRole && AADHAAR_VIEW_ROLES.includes(viewerRole) && !!visit.aadhaar_number;

  async function reveal() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/field-verifications/${visit.id}/aadhaar`, {
        headers: { Authorization: `Bearer ${getAdminToken() ?? ""}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not open the Aadhaar number.");
      setFull(String(body.aadhaarNumber).replace(/(\d{4})(\d{4})(\d{4})/, "$1 $2 $3"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open the Aadhaar number.");
    } finally {
      setLoading(false);
    }
  }

  const role = ADMIN_ROLE_LABELS[visit.captured_by_role as AdminRole] ?? visit.captured_by_role;
  return (
    <div className="rounded-md border border-slate-200 p-3 text-xs">
      <p className="font-semibold text-slate-700">
        {when(visit.captured_at)} - {visit.captured_by_display_name} <span className="font-normal text-slate-500">({role})</span>
      </p>
      {visit.gps_lat && visit.gps_lng && (
        <p className="mt-1 text-slate-500">
          GPS: {visit.gps_lat}, {visit.gps_lng}
        </p>
      )}
      {visit.water_connection_status && (
        <p className="mt-1 text-slate-600">Water supply: {waterStatusLabel(visit.water_connection_status, visit.water_connection_count)}</p>
      )}
      {visit.aadhaar_number && (
        <p className="mt-1 flex flex-wrap items-center gap-2 text-slate-600">
          <span>
            Aadhaar: <b className="font-mono">{full ?? visit.aadhaar_number}</b>
          </span>
          {canReveal && !full && (
            <button
              type="button"
              onClick={reveal}
              disabled={loading}
              className="inline-flex items-center gap-1 rounded border border-slate-300 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
            >
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />} Show full number
            </button>
          )}
          {error && <span className="text-red-600">{error}</span>}
        </p>
      )}
      <FieldVerificationPhotos visit={visit} />
    </div>
  );
}
