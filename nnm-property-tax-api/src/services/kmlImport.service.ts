import { XMLParser } from "fast-xml-parser";
import { ApiError } from "../utils/ApiError";

export interface KmlPlacemark {
  name: string;
  geometryType: "polygon" | "linestring";
  coordinates: { lat: number; lng: number }[];
}

/**
 * Parses a KML file's Placemarks into our {lat,lng} coordinate shape.
 * KML itself stores coordinates as "lng,lat,altitude" triples
 * (comma-separated within a point, space-separated between points) -
 * every point here gets re-ordered and the altitude dropped. Only
 * Polygon (outerBoundaryIs) and LineString geometries are recognised,
 * since those are the only two this app has a use for (ward
 * boundaries and infrastructure lines respectively) - anything else
 * (Point, MultiGeometry, etc.) in the file is silently skipped rather
 * than rejecting the whole upload over one unsupported Placemark.
 */
export function parseKmlPlacemarks(kmlContent: string): KmlPlacemark[] {
  let parsed: unknown;
  try {
    const parser = new XMLParser({ ignoreAttributes: true, trimValues: true });
    parsed = parser.parse(kmlContent);
  } catch {
    throw ApiError.badRequest("This file could not be read as KML - please check it's a valid, unmodified export.");
  }

  const kmlRoot = (parsed as Record<string, unknown>)?.kml as Record<string, unknown> | undefined;
  if (!kmlRoot || typeof kmlRoot !== "object") {
    throw ApiError.badRequest("This doesn't look like a KML file - no <kml> root element found.");
  }
  // A <Document> (or <Folder>) with no children parses to an empty
  // string rather than an object - fall back to the kml root itself
  // in that case so this reads as "no placemarks found" rather than
  // "not KML", since the file was valid KML, just empty.
  const documentRaw = kmlRoot.Document;
  const document = documentRaw && typeof documentRaw === "object" ? (documentRaw as Record<string, unknown>) : undefined;
  const container = document ?? kmlRoot;

  const rawPlacemarks = container.Placemark;
  const placemarkList: Record<string, unknown>[] = Array.isArray(rawPlacemarks) ? rawPlacemarks : rawPlacemarks ? [rawPlacemarks] : [];

  const results: KmlPlacemark[] = [];
  for (const pm of placemarkList) {
    const name = typeof pm.name === "string" ? pm.name.trim() : "Unnamed";

    const polygon = pm.Polygon as Record<string, unknown> | undefined;
    const lineString = pm.LineString as Record<string, unknown> | undefined;

    if (polygon) {
      const outer = polygon.outerBoundaryIs as Record<string, unknown> | undefined;
      const ring = outer?.LinearRing as Record<string, unknown> | undefined;
      const coordText = ring?.coordinates;
      if (typeof coordText === "string") {
        const points = parseCoordinateString(coordText);
        if (points.length >= 3) results.push({ name, geometryType: "polygon", coordinates: dedupeClosingPoint(points) });
      }
    } else if (lineString) {
      const coordText = lineString.coordinates;
      if (typeof coordText === "string") {
        const points = parseCoordinateString(coordText);
        if (points.length >= 2) results.push({ name, geometryType: "linestring", coordinates: points });
      }
    }
  }

  if (results.length === 0) {
    throw ApiError.badRequest("No usable Polygon or LineString shapes were found in this KML file.");
  }
  return results;
}

function parseCoordinateString(coordText: string): { lat: number; lng: number }[] {
  return coordText
    .trim()
    .split(/\s+/)
    .map((triple): { lat: number; lng: number } => {
      const [lngStr, latStr] = triple.split(",");
      return { lat: Number(latStr), lng: Number(lngStr) };
    })
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
}

/** KML polygons explicitly repeat the first point as the last to close the ring - our own storage doesn't need that duplicate. */
function dedupeClosingPoint(points: { lat: number; lng: number }[]): { lat: number; lng: number }[] {
  if (points.length < 2) return points;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (first.lat === last.lat && first.lng === last.lng) return points.slice(0, -1);
  return points;
}
