"use client";

import { useRef, useState } from "react";
import { Upload, CheckCircle2, AlertCircle } from "lucide-react";
import { importWardBoundariesKml, importInfrastructureLinesKml } from "@/lib/admin-geo-api";

const selectClass = "rounded-md border border-slate-300 px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1";

/**
 * Upload a KML export (from QGIS, Google Earth, or similar) to bulk-
 * import ward boundaries or classified infrastructure lines, instead
 * of tracing each one by hand on the map. Every Placemark of the
 * right geometry type in the file becomes its own row.
 */
export function KmlUploadForm({ onImported }: { onImported: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState<"ward" | "infrastructure">("ward");
  const [lineType, setLineType] = useState<"road" | "drain" | "canal">("road");
  const [roadCategory, setRoadCategory] = useState<"PMR" | "MR" | "OR">("MR");
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError(null);
    setResult(null);
    try {
      const kmlContent = await file.text();
      if (target === "ward") {
        const { imported } = await importWardBoundariesKml(kmlContent, file.name);
        setResult(`Imported ${imported} ward boundary/boundaries from ${file.name}.`);
      } else {
        const { imported } = await importInfrastructureLinesKml({
          kmlContent,
          fileName: file.name,
          lineType,
          roadCategory: lineType === "road" ? roadCategory : null,
        });
        setResult(`Imported ${imported} ${lineType} line(s) from ${file.name}.`);
      }
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not import this file.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="mb-3 text-sm font-semibold text-slate-800">Import from KML</p>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select value={target} onChange={(e) => setTarget(e.target.value as typeof target)} className={selectClass}>
          <option value="ward">Ward boundary</option>
          <option value="infrastructure">Road / Drain / Canal</option>
        </select>
        {target === "infrastructure" && (
          <>
            <select value={lineType} onChange={(e) => setLineType(e.target.value as typeof lineType)} className={selectClass}>
              <option value="road">Road</option>
              <option value="drain">Drain</option>
              <option value="canal">Canal</option>
            </select>
            {lineType === "road" && (
              <select value={roadCategory} onChange={(e) => setRoadCategory(e.target.value as typeof roadCategory)} className={selectClass}>
                <option value="PMR">PMR - Principal Main Road</option>
                <option value="MR">MR - Main Road</option>
                <option value="OR">OR - Other Road</option>
              </select>
            )}
          </>
        )}
        <input ref={fileInputRef} type="file" accept=".kml" onChange={(e) => handleFile(e.target.files?.[0])} className="hidden" id="kml-upload-input" />
        <label
          htmlFor="kml-upload-input"
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-nnm-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-nnm-blue-dark"
        >
          <Upload className="h-3.5 w-3.5" />
          {uploading ? "Importing…" : "Choose KML File"}
        </label>
      </div>
      {result && (
        <div role="status" className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-2.5 text-xs text-green-800">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          {result}
        </div>
      )}
      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}
