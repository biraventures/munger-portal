export interface PropertyGeoSummary {
  holding_no: string;
  owner_name: string;
  address: string;
  area_sqft: string;
  ward: string | null;
  geometry_type: "point" | "polygon" | null;
  geometry_coordinates: { lat: number; lng: number } | { lat: number; lng: number }[] | null;
  geometry_captured_by: string | null;
  geometry_captured_at: string | null;
}

export interface InfrastructureLineRow {
  id: number;
  name: string;
  line_type: "road" | "drain" | "canal";
  coordinates: { lat: number; lng: number }[];
  road_category: "PMR" | "MR" | "OR" | null;
  source_file_name: string | null;
  created_by: string;
  created_at: string;
  last_modified_by: string | null;
  last_modified_at: string | null;
}

export interface WardBoundaryRow {
  id: number;
  ward_number: string;
  coordinates: { lat: number; lng: number }[];
  source_file_name: string | null;
  created_by: string;
  created_at: string;
  last_modified_by: string | null;
  last_modified_at: string | null;
}
