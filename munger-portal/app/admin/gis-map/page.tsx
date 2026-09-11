"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { AlertCircle, Map as MapIcon, Download, RefreshCw } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import {
  listAllPropertyGeo,
  fetchInfrastructureLines,
  fetchWardBoundaries,
  downloadGeoExport,
  type PropertyGeo,
  type InfrastructureLine,
  type WardBoundary,
  type GeoExportFormat,
} from "@/lib/admin-geo-api";

const GisOverviewMap = dynamic(() => import("@/components/geo/gis-overview-map").then((m) => m.GisOverviewMap), { ssr: false });
const KmlUploadForm = dynamic(() => import("@/components/geo/kml-upload-form").then((m) => m.KmlUploadForm), { ssr: false });

const GIS_MAP_ROLES = ["assistant_town_planning_supervisor", "assistant_architect", "commissioner"];
const KML_UPLOAD_ROLES = ["assistant_town_planning_supervisor", "commissioner"];

/** View-only GIS map showing every holding's assigned coordinates, infrastructure lines, and ward boundaries at once. ATPS/Commissioner can additionally bulk-import ward boundaries and classified roads/drains/canals from a KML file. */
export default function GisMapPage() {
  const admin = useAdminGuard();
  const [properties, setProperties] = useState<PropertyGeo[] | null>(null);
  const [lines, setLines] = useState<InfrastructureLine[] | null>(null);
  const [wards, setWards] = useState<WardBoundary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    Promise.all([listAllPropertyGeo(), fetchInfrastructureLines(), fetchWardBoundaries()])
      .then(([p, l, w]) => {
        setProperties(p);
        setLines(l);
        setWards(w);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the map."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!admin || !GIS_MAP_ROLES.includes(admin.role)) return;
    load();
  }, [admin]);

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

  if (!GIS_MAP_ROLES.includes(admin.role)) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <main className="mx-auto max-w-2xl px-6 py-10">
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            The GIS map is restricted to the Assistant Town Planning Supervisor, Assistant Architect, and the Municipal Commissioner.
          </div>
        </main>
      </div>
    );
  }

  const pointCount = properties?.filter((p) => p.geometry_type === "point").length ?? 0;
  const polygonCount = properties?.filter((p) => p.geometry_type === "polygon").length ?? 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />

      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <MapIcon className="h-6 w-6" />
          GIS Map
        </h1>
        <p className="mb-4 text-sm text-slate-500">
          {properties
            ? `${properties.length} holding(s) mapped - ${pointCount} point(s), ${polygonCount} polygon(s). ${lines?.length ?? 0} infrastructure line(s), ${wards?.length ?? 0} ward boundary/boundaries.`
            : "Every holding with assigned coordinates, plus infrastructure lines and ward boundaries."}
        </p>

        <div className="mb-5 flex flex-wrap items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
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

        {KML_UPLOAD_ROLES.includes(admin.role) && (
          <div className="mb-5">
            <KmlUploadForm onImported={load} />
          </div>
        )}

        {error && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {loading && !properties ? (
          <p className="text-sm text-slate-400">Loading map…</p>
        ) : properties ? (
          <GisOverviewMap properties={properties} infrastructureLines={lines ?? []} wardBoundaries={wards ?? []} />
        ) : null}
      </main>
    </div>
  );
}
