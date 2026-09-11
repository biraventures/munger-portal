"use client";

import { useState } from "react";
import { MapContainer, TileLayer, Marker, Polygon, Polyline, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import type { PropertyGeo, LatLng, WardBoundary, InfrastructureLine } from "@/lib/admin-geo-api";

const markerIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const MUNGER_CENTER: [number, number] = [25.3746, 86.4735];

const ROAD_CATEGORY_COLORS: Record<string, string> = { PMR: "#dc2626", MR: "#ea580c", OR: "#ca8a04" };
const LINE_TYPE_COLORS: Record<string, string> = { road: "#ea580c", drain: "#0891b2", canal: "#0284c7" };
const WARD_BOUNDARY_COLOR = "#16a34a";

/**
 * View-only overview of everything mapped so far - holdings (points
 * as markers, polygons as filled boundaries), infrastructure lines
 * (color-coded by road category where set, otherwise by line type),
 * and ward boundaries (dashed, since these are administrative rather
 * than physical). Every shape has a popup with its identifying
 * details on click. Unlike the single-holding picker used for
 * capture, nothing here is editable - this is purely a map of what's
 * already been recorded, for town planning reference (Assistant
 * Architect, ATPS, Commissioner).
 */
export function GisOverviewMap({
  properties,
  infrastructureLines = [],
  wardBoundaries = [],
}: {
  properties: PropertyGeo[];
  infrastructureLines?: InfrastructureLine[];
  wardBoundaries?: WardBoundary[];
}) {
  const [center] = useState<[number, number]>(() => {
    const withPoint = properties.find((p) => p.geometry_type === "point" && p.geometry_coordinates && !Array.isArray(p.geometry_coordinates));
    if (withPoint) {
      const pt = withPoint.geometry_coordinates as LatLng;
      return [pt.lat, pt.lng];
    }
    return MUNGER_CENTER;
  });

  return (
    <div className="overflow-hidden rounded-md border border-slate-300" style={{ height: 560 }}>
      <MapContainer center={center} zoom={15} style={{ height: "100%", width: "100%" }}>
        <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

        {wardBoundaries.map((w) => (
          <Polygon
            key={`ward-${w.id}`}
            positions={w.coordinates.map((pt) => [pt.lat, pt.lng] as [number, number])}
            pathOptions={{ color: WARD_BOUNDARY_COLOR, fillOpacity: 0.05, dashArray: "6 4", weight: 2 }}
          >
            <Popup>
              <div className="text-xs">
                <p className="font-semibold">Ward {w.ward_number}</p>
              </div>
            </Popup>
          </Polygon>
        ))}

        {infrastructureLines.map((l) => (
          <Polyline
            key={`line-${l.id}`}
            positions={l.coordinates.map((pt) => [pt.lat, pt.lng] as [number, number])}
            pathOptions={{ color: l.road_category ? ROAD_CATEGORY_COLORS[l.road_category] : LINE_TYPE_COLORS[l.line_type], weight: 3 }}
          >
            <Popup>
              <div className="text-xs">
                <p className="font-semibold">{l.name}</p>
                <p className="capitalize text-slate-500">
                  {l.line_type}
                  {l.road_category ? ` - ${l.road_category}` : ""}
                </p>
              </div>
            </Popup>
          </Polyline>
        ))}

        {properties.map((p) => {
          if (!p.geometry_type || !p.geometry_coordinates) return null;
          const popupContent = (
            <div className="text-xs">
              <p className="font-semibold">{p.holding_no}</p>
              <p>{p.owner_name}</p>
              <p className="text-slate-500">{p.address}</p>
              <p className="text-slate-500">{p.area_sqft} sqft</p>
            </div>
          );
          if (p.geometry_type === "point" && !Array.isArray(p.geometry_coordinates)) {
            const pt = p.geometry_coordinates;
            return (
              <Marker key={p.holding_no} position={[pt.lat, pt.lng]} icon={markerIcon}>
                <Popup>{popupContent}</Popup>
              </Marker>
            );
          }
          if (p.geometry_type === "polygon" && Array.isArray(p.geometry_coordinates)) {
            const positions = p.geometry_coordinates.map((pt) => [pt.lat, pt.lng] as [number, number]);
            return (
              <Polygon key={p.holding_no} positions={positions} pathOptions={{ color: "#1a3d6d", fillOpacity: 0.25 }}>
                <Popup>{popupContent}</Popup>
              </Polygon>
            );
          }
          return null;
        })}
      </MapContainer>
    </div>
  );
}
