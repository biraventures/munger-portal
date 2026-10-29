"use client";

import { useState } from "react";
import { Image as ImageIcon, Loader2 } from "lucide-react";
import { fetchReceivingCopyPhoto } from "@/lib/collector-field-api";
import { waterStatusLabel } from "./water-status-field";

export interface ReceivingCopyVisit {
  id: string;
  demand_no: string;
  latitude: string | null;
  longitude: string | null;
  uploaded_by_display_name: string;
  uploaded_at: string;
  water_connection_status?: string | null;
  water_connection_count?: number | null;
}

/** A Tax Collector's field visit that delivered a demand notice: the signed receiving copy (photo on request) and GPS. */
export function ReceivingCopyVisitEntry({ visit, when }: { visit: ReceivingCopyVisit; when: (v: string) => string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function show() {
    setLoading(true);
    setError(null);
    try {
      setUrl(await fetchReceivingCopyPhoto(visit.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the photo.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="rounded-md border border-slate-200 p-3 text-xs">
      <p className="font-semibold text-slate-700">
        {when(visit.uploaded_at)} - {visit.uploaded_by_display_name} (tax collector)
        <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-blue-800">
          Demand notice delivered
        </span>
      </p>
      <p className="mt-1 text-slate-500">
        Signed receiving copy of demand notice {visit.demand_no}
        {visit.latitude && visit.longitude ? ` · GPS: ${visit.latitude}, ${visit.longitude}` : " · no GPS"}
      </p>
      {visit.water_connection_status && (
        <p className="mt-1 text-slate-600">Water supply: {waterStatusLabel(visit.water_connection_status, visit.water_connection_count)}</p>
      )}
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- authenticated blob URL
        <img src={url} alt={`Receiving copy of notice ${visit.demand_no}`} className="mt-2 max-h-72 rounded border border-slate-200" />
      ) : (
        <button
          type="button"
          onClick={show}
          disabled={loading}
          className="mt-2 inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 font-semibold text-slate-700 hover:bg-slate-50"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImageIcon className="h-3 w-3" />} View receiving copy
        </button>
      )}
      {error && <p className="mt-1 text-red-600">{error}</p>}
    </div>
  );
}
