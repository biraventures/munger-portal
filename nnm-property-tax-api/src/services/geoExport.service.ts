import ExcelJS from "exceljs";
import { geoRepository } from "../repositories/geo.repository";
import type { PropertyGeoSummary, InfrastructureLineRow } from "../types/geo.types";

export type GeoExportFormat = "geojson" | "kml" | "xlsx";
export type GeoExportDataset = "properties" | "infrastructure" | "all";

function propertyToGeoJsonFeature(p: PropertyGeoSummary) {
  if (!p.geometry_type || !p.geometry_coordinates) return null;
  const geometry =
    p.geometry_type === "point"
      ? { type: "Point", coordinates: [(p.geometry_coordinates as { lat: number; lng: number }).lng, (p.geometry_coordinates as { lat: number; lng: number }).lat] }
      : {
          type: "Polygon",
          coordinates: [[...(p.geometry_coordinates as { lat: number; lng: number }[]).map((pt) => [pt.lng, pt.lat])]],
        };
  return {
    type: "Feature",
    geometry,
    properties: {
      holdingNo: p.holding_no,
      ownerName: p.owner_name,
      address: p.address,
      areaSqft: p.area_sqft,
      ward: p.ward,
      capturedBy: p.geometry_captured_by,
      capturedAt: p.geometry_captured_at,
    },
  };
}

function lineToGeoJsonFeature(l: InfrastructureLineRow) {
  return {
    type: "Feature",
    geometry: { type: "LineString", coordinates: l.coordinates.map((pt) => [pt.lng, pt.lat]) },
    properties: { name: l.name, lineType: l.line_type },
  };
}

export async function buildGeoJson(dataset: GeoExportDataset): Promise<object> {
  const features: unknown[] = [];
  if (dataset === "properties" || dataset === "all") {
    const props = await geoRepository.listAllPropertyGeo();
    for (const p of props) {
      const f = propertyToGeoJsonFeature(p);
      if (f) features.push(f);
    }
  }
  if (dataset === "infrastructure" || dataset === "all") {
    const lines = await geoRepository.listInfrastructureLines();
    for (const l of lines) features.push(lineToGeoJsonFeature(l));
  }
  return { type: "FeatureCollection", features };
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function buildKml(dataset: GeoExportDataset): Promise<string> {
  const placemarks: string[] = [];

  if (dataset === "properties" || dataset === "all") {
    const props = await geoRepository.listAllPropertyGeo();
    for (const p of props) {
      if (!p.geometry_type || !p.geometry_coordinates) continue;
      const name = xmlEscape(p.holding_no);
      const desc = xmlEscape(`${p.owner_name} - ${p.address}`);
      let geom = "";
      if (p.geometry_type === "point") {
        const pt = p.geometry_coordinates as { lat: number; lng: number };
        geom = `<Point><coordinates>${pt.lng},${pt.lat}</coordinates></Point>`;
      } else {
        const pts = p.geometry_coordinates as { lat: number; lng: number }[];
        const coordStr = pts.map((pt) => `${pt.lng},${pt.lat}`).join(" ");
        const closed = pts.length > 0 ? `${coordStr} ${pts[0]!.lng},${pts[0]!.lat}` : coordStr;
        geom = `<Polygon><outerBoundaryIs><LinearRing><coordinates>${closed}</coordinates></LinearRing></outerBoundaryIs></Polygon>`;
      }
      placemarks.push(`<Placemark><name>${name}</name><description>${desc}</description>${geom}</Placemark>`);
    }
  }

  if (dataset === "infrastructure" || dataset === "all") {
    const lines = await geoRepository.listInfrastructureLines();
    for (const l of lines) {
      const name = xmlEscape(l.name);
      const desc = xmlEscape(l.line_type);
      const coordStr = l.coordinates.map((pt) => `${pt.lng},${pt.lat}`).join(" ");
      placemarks.push(`<Placemark><name>${name}</name><description>${desc}</description><LineString><coordinates>${coordStr}</coordinates></LineString></Placemark>`);
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document>${placemarks.join("")}</Document></kml>`;
}

/** One row per vertex - the most usable flat representation for a point (1 row), polygon, or line (many rows sharing a sequence number) in a spreadsheet. */
export async function buildGeoXlsx(dataset: GeoExportDataset): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook();

  if (dataset === "properties" || dataset === "all") {
    const sheet = workbook.addWorksheet("Holding Coordinates");
    sheet.columns = [
      { header: "Holding No", key: "holdingNo", width: 18 },
      { header: "Owner Name", key: "ownerName", width: 28 },
      { header: "Geometry Type", key: "geometryType", width: 14 },
      { header: "Sequence", key: "sequence", width: 10 },
      { header: "Latitude", key: "lat", width: 14 },
      { header: "Longitude", key: "lng", width: 14 },
      { header: "Captured By", key: "capturedBy", width: 20 },
      { header: "Captured At", key: "capturedAt", width: 22 },
    ];
    const props = await geoRepository.listAllPropertyGeo();
    for (const p of props) {
      if (!p.geometry_type || !p.geometry_coordinates) continue;
      if (p.geometry_type === "point") {
        const pt = p.geometry_coordinates as { lat: number; lng: number };
        sheet.addRow({ holdingNo: p.holding_no, ownerName: p.owner_name, geometryType: "point", sequence: 1, lat: pt.lat, lng: pt.lng, capturedBy: p.geometry_captured_by, capturedAt: p.geometry_captured_at });
      } else {
        const pts = p.geometry_coordinates as { lat: number; lng: number }[];
        pts.forEach((pt, i) => {
          sheet.addRow({ holdingNo: p.holding_no, ownerName: p.owner_name, geometryType: "polygon", sequence: i + 1, lat: pt.lat, lng: pt.lng, capturedBy: p.geometry_captured_by, capturedAt: p.geometry_captured_at });
        });
      }
    }
  }

  if (dataset === "infrastructure" || dataset === "all") {
    const sheet = workbook.addWorksheet("Infrastructure Lines");
    sheet.columns = [
      { header: "Name", key: "name", width: 28 },
      { header: "Type", key: "lineType", width: 12 },
      { header: "Sequence", key: "sequence", width: 10 },
      { header: "Latitude", key: "lat", width: 14 },
      { header: "Longitude", key: "lng", width: 14 },
    ];
    const lines = await geoRepository.listInfrastructureLines();
    for (const l of lines) {
      l.coordinates.forEach((pt, i) => {
        sheet.addRow({ name: l.name, lineType: l.line_type, sequence: i + 1, lat: pt.lat, lng: pt.lng });
      });
    }
  }

  return workbook.xlsx.writeBuffer();
}
