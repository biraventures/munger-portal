export interface PropertyFieldVerificationRow {
  id: number;
  holding_no: string;
  gps_lat: string | null;
  gps_lng: string | null;
  holding_photo_path: string | null;
  aadhaar_number: string | null;
  aadhaar_photo_path: string | null;
  /** Recorded on this visit: the holding's original owner has died, so no Aadhaar can be collected. */
  owner_deceased: boolean;
  previous_receipt_photo_path: string | null;
  land_document_photo_path: string | null;
  register_photo_path: string | null;
  water_connection_status: string | null;
  water_connection_count: number | null;
  captured_by_username: string;
  captured_by_display_name: string;
  captured_by_role: string;
  captured_at: Date;
}
