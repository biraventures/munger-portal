"use client";

import { Plus, Trash2 } from "lucide-react";
import type { LatLng } from "@/lib/admin-geo-api";

const inputClass = "w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1";

/**
 * Manual latitude/longitude entry - the fallback for when tapping a
 * map isn't practical (poor GPS lock, coordinates read off another
 * device/survey sheet, etc.). Edits the same value the map component
 * uses, so either can be used to build up the same point/polygon/line.
 */
export function ManualCoordinateEntry({
  mode,
  value,
  onChange,
  maxPoints,
}: {
  mode: "point" | "polygon" | "line";
  value: LatLng | LatLng[] | null;
  onChange: (value: LatLng | LatLng[]) => void;
  maxPoints?: number;
}) {
  if (mode === "point") {
    const pt = !Array.isArray(value) ? value : null;
    return (
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Latitude</label>
          <input
            type="number"
            step="any"
            value={pt?.lat ?? ""}
            onChange={(e) => onChange({ lat: Number(e.target.value), lng: pt?.lng ?? 0 })}
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Longitude</label>
          <input
            type="number"
            step="any"
            value={pt?.lng ?? ""}
            onChange={(e) => onChange({ lat: pt?.lat ?? 0, lng: Number(e.target.value) })}
            className={inputClass}
          />
        </div>
      </div>
    );
  }

  const points = Array.isArray(value) ? value : [];

  function updatePoint(i: number, field: "lat" | "lng", v: number) {
    const next = points.map((p, idx) => (idx === i ? { ...p, [field]: v } : p));
    onChange(next);
  }
  function removePoint(i: number) {
    onChange(points.filter((_, idx) => idx !== i));
  }
  function addPoint() {
    onChange([...points, { lat: 0, lng: 0 }]);
  }

  return (
    <div>
      <div className="space-y-2">
        {points.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-5 shrink-0 text-xs text-slate-400">{i + 1}.</span>
            <input type="number" step="any" placeholder="Latitude" value={p.lat} onChange={(e) => updatePoint(i, "lat", Number(e.target.value))} className={inputClass} />
            <input type="number" step="any" placeholder="Longitude" value={p.lng} onChange={(e) => updatePoint(i, "lng", Number(e.target.value))} className={inputClass} />
            <button type="button" onClick={() => removePoint(i)} className="shrink-0 text-red-500 hover:text-red-700">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addPoint}
        disabled={Boolean(maxPoints && points.length >= maxPoints)}
        className="mt-2 inline-flex items-center gap-1 rounded-md border border-nnm-blue px-2.5 py-1.5 text-xs font-semibold text-nnm-blue hover:bg-blue-50 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400 disabled:hover:bg-transparent"
      >
        <Plus className="h-3.5 w-3.5" />
        {maxPoints && points.length >= maxPoints ? `Maximum of ${maxPoints} points reached` : "Add point"}
      </button>
    </div>
  );
}
