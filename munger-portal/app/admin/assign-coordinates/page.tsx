"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Search, AlertCircle, CheckCircle2, MapPin, Download } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import { ManualCoordinateEntry } from "@/components/geo/manual-coordinate-entry";
import {
  searchPropertiesForGeo,
  savePropertyGeo,
  fetchGeoProgress,
  downloadGeoExport,
  POLYGON_AREA_THRESHOLD_SQFT,
  type PropertyGeo,
  type LatLng,
  type GeoExportFormat,
} from "@/lib/admin-geo-api";

// Leaflet touches window/document directly and can't be rendered on
// the server - load it client-only.
const CoordinateMapPicker = dynamic(() => import("@/components/geo/coordinate-map-picker").then((m) => m.CoordinateMapPicker), { ssr: false });

const ATPS_ROLES = ["assistant_town_planning_supervisor", "commissioner"];

export default function AssignCoordinatesPage() {
  const admin = useAdminGuard();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PropertyGeo[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<PropertyGeo | null>(null);
  const [geometryType, setGeometryType] = useState<"point" | "polygon">("point");
  const [coordinates, setCoordinates] = useState<LatLng | LatLng[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ total: string; withGeometry: string } | null>(null);

  useEffect(() => {
    if (!admin) return;
    fetchGeoProgress().then(setProgress).catch(() => setProgress(null));
  }, [admin, saved]);

  async function handleSearch() {
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    try {
      setResults(await searchPropertiesForGeo(query.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not search holdings.");
    } finally {
      setSearching(false);
    }
  }

  function handleSelect(property: PropertyGeo) {
    setSelected(property);
    setSaved(false);
    setError(null);
    const area = Number(property.area_sqft);
    const suggested = area >= POLYGON_AREA_THRESHOLD_SQFT ? "polygon" : "point";
    setGeometryType(property.geometry_type ?? suggested);
    setCoordinates(property.geometry_coordinates ?? (property.geometry_type === "polygon" || suggested === "polygon" ? [] : { lat: 0, lng: 0 }));
  }

  async function handleSave() {
    if (!selected || !coordinates) return;
    if (geometryType === "polygon" && (!Array.isArray(coordinates) || coordinates.length < 3)) {
      setError("A polygon needs at least 3 points.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await savePropertyGeo(selected.holding_no, geometryType, coordinates);
      setSelected(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save coordinates.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDownload(format: GeoExportFormat) {
    try {
      await downloadGeoExport(format, "properties");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not download.");
    }
  }

  if (!admin) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  if (!ATPS_ROLES.includes(admin.role)) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <main className="mx-auto max-w-2xl px-6 py-10">
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Assigning holding coordinates is restricted to the Assistant Town Planning Supervisor and the Municipal Commissioner.
          </div>
        </main>
      </div>
    );
  }

  const area = selected ? Number(selected.area_sqft) : 0;
  const suggestedType = area >= POLYGON_AREA_THRESHOLD_SQFT ? "polygon" : "point";

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />

      <main className="mx-auto max-w-3xl px-6 py-10">
        <div className="mb-1 flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
            <MapPin className="h-6 w-6" />
            Assign Holding Coordinates
          </h1>
          <Link href="/admin/gis-map" className="text-sm font-semibold text-nnm-blue hover:underline">
            View GIS Map →
          </Link>
        </div>
        <p className="mb-4 text-sm text-slate-500">
          {progress
            ? `${progress.withGeometry} of ${progress.total} holdings have coordinates assigned.`
            : "Search for a holding to assign its GPS coordinates."}
        </p>

        <div className="mb-5 flex flex-wrap items-center gap-2">
          {(["geojson", "kml", "xlsx"] as GeoExportFormat[]).map((f) => (
            <button
              key={f}
              onClick={() => handleDownload(f)}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5" />
              Download {f.toUpperCase()}
            </button>
          ))}
        </div>

        {error && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="mb-6 flex items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2.5">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Search by holding number or owner name"
              className="flex-1 text-sm outline-none"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={searching || !query.trim()}
            className="rounded-md bg-nnm-blue px-4 py-2.5 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
          >
            {searching ? "Searching…" : "Search"}
          </button>
        </div>

        {results && !selected && (
          <div className="mb-6 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {results.length === 0 ? (
              <p className="p-4 text-sm text-slate-400">No holdings found.</p>
            ) : (
              results.map((p) => (
                <button key={p.holding_no} onClick={() => handleSelect(p)} className="flex w-full items-center justify-between p-4 text-left hover:bg-slate-50">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{p.holding_no}</p>
                    <p className="text-xs text-slate-500">
                      {p.owner_name} - {p.area_sqft} sqft
                    </p>
                  </div>
                  {p.geometry_type && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700">
                      <CheckCircle2 className="h-3 w-3" />
                      {p.geometry_type}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        )}

        {selected && (
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900">{selected.holding_no}</h2>
                <p className="text-xs text-slate-500">
                  {selected.owner_name} - {selected.address} - {selected.area_sqft} sqft
                </p>
              </div>
              <button onClick={() => setSelected(null)} className="text-xs font-semibold text-slate-500 hover:underline">
                Change holding
              </button>
            </div>

            {saved && (
              <div role="status" className="mb-4 flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                Coordinates saved.
              </div>
            )}

            <div className="mb-4">
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Geometry type - suggested: <span className="font-semibold">{suggestedType}</span> (holdings at or above{" "}
                {POLYGON_AREA_THRESHOLD_SQFT.toLocaleString("en-IN")} sqft get a polygon)
              </label>
              <div className="flex gap-2">
                {(["point", "polygon"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      setGeometryType(t);
                      setCoordinates(t === "polygon" ? (Array.isArray(coordinates) ? coordinates : []) : { lat: 0, lng: 0 });
                    }}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold capitalize ${
                      geometryType === t ? "bg-nnm-blue text-white" : "border border-slate-300 text-slate-600"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <p className="mb-1 text-xs font-medium text-slate-600">Tap on the map</p>
              <CoordinateMapPicker mode={geometryType} value={coordinates} onChange={setCoordinates} maxPoints={geometryType === "polygon" ? 15 : undefined} />
            </div>

            <div className="mb-5">
              <p className="mb-1 text-xs font-medium text-slate-600">Or enter manually</p>
              <ManualCoordinateEntry mode={geometryType} value={coordinates} onChange={setCoordinates} maxPoints={geometryType === "polygon" ? 15 : undefined} />
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full rounded-md bg-nnm-blue px-4 py-3 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save Coordinates"}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
