"use client";

import { useState } from "react";
import { MapContainer, TileLayer, Marker, Polygon, Polyline, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Undo2, Trash2 } from "lucide-react";
import type { LatLng } from "@/lib/admin-geo-api";

// The default Leaflet marker icon references image files by a path
// that doesn't resolve correctly under Next.js's bundler - rebuild it
// pointing at the CDN copies instead, otherwise markers render as a
// broken image (or nothing at all).
const markerIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const MUNGER_CENTER: [number, number] = [25.3746, 86.4735];

function ClickCapture({ onClick }: { onClick: (latlng: LatLng) => void }) {
  useMapEvents({
    click(e) {
      onClick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

/**
 * A tap-to-place map for capturing a holding's coordinates or an
 * infrastructure line's path. "point" mode places/moves a single
 * marker on each click. "polygon"/"line" mode appends a new vertex on
 * each click, showing the shape being built as you go - polygon
 * closes visually back to the first point, a line doesn't.
 */
export function CoordinateMapPicker({
  mode,
  value,
  onChange,
  center,
  maxPoints,
}: {
  mode: "point" | "polygon" | "line";
  value: LatLng | LatLng[] | null;
  onChange: (value: LatLng | LatLng[]) => void;
  center?: LatLng;
  /** Caps how many vertices polygon/line mode will accept - holdings are capped at 15 by the caller, since irregular plots rarely need more and a hard ceiling guards against an accidental tap storm; infrastructure lines/ward boundaries are left uncapped. */
  maxPoints?: number;
}) {
  const [mapCenter] = useState<[number, number]>(center ? [center.lat, center.lng] : MUNGER_CENTER);

  function handleMapClick(pt: LatLng) {
    if (mode === "point") {
      onChange(pt);
    } else {
      const current = Array.isArray(value) ? value : [];
      if (maxPoints && current.length >= maxPoints) return;
      onChange([...current, pt]);
    }
  }

  function handleUndo() {
    if (!Array.isArray(value) || value.length === 0) return;
    onChange(value.slice(0, -1));
  }

  function handleClear() {
    onChange(mode === "point" ? ({ lat: mapCenter[0], lng: mapCenter[1] } as LatLng) : []);
  }

  const polyPositions = Array.isArray(value) ? value.map((p) => [p.lat, p.lng] as [number, number]) : [];

  return (
    <div>
      <div className="overflow-hidden rounded-md border border-slate-300" style={{ height: 320 }}>
        <MapContainer center={mapCenter} zoom={17} style={{ height: "100%", width: "100%" }}>
          <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <ClickCapture onClick={handleMapClick} />
          {mode === "point" && value && !Array.isArray(value) && <Marker position={[value.lat, value.lng]} icon={markerIcon} />}
          {mode === "polygon" && polyPositions.length > 0 && <Polygon positions={polyPositions} pathOptions={{ color: "#1a3d6d" }} />}
          {mode === "line" && polyPositions.length > 0 && <Polyline positions={polyPositions} pathOptions={{ color: "#1a3d6d" }} />}
          {mode !== "point" &&
            polyPositions.map((pos, i) => <Marker key={i} position={pos} icon={markerIcon} />)}
        </MapContainer>
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
        <span>
          {mode === "point"
            ? "Tap the map to place the point."
            : maxPoints && polyPositions.length >= maxPoints
              ? `Maximum of ${maxPoints} points reached - undo a point to add a different one.`
              : `Tap the map to add points in order (${polyPositions.length}${maxPoints ? ` of ${maxPoints}` : ""} placed so far).`}
        </span>
        {mode !== "point" && (
          <div className="flex gap-2">
            <button type="button" onClick={handleUndo} className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-slate-600 hover:bg-slate-50">
              <Undo2 className="h-3 w-3" />
              Undo last
            </button>
            <button type="button" onClick={handleClear} className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-slate-600 hover:bg-slate-50">
              <Trash2 className="h-3 w-3" />
              Clear
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
