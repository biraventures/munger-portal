export interface PropertyFieldVerificationRow {
  id: number;
  holding_no: string;
  gps_lat: string | null;
  gps_lng: string | null;
  holding_photo_path: string | null;
  aadhaar_number: string | null;
  aadhaar_photo_path: string | null;
  previous_receipt_photo_path: string | null;
  land_document_photo_path: string | null;
  captured_by_username: string;
  captured_by_display_name: string;
  captured_by_role: string;
  captured_at: Date;
}
