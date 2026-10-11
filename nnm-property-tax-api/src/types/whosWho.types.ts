/** Designations in the order the public page lists them. Ward Councillors come last, by ward number. */
export const WHOS_WHO_DESIGNATIONS = [
  { key: "mayor", en: "Mayor", hi: "महापौर", singleSeat: true },
  { key: "deputy_mayor", en: "Deputy Mayor", hi: "उप महापौर", singleSeat: true },
  { key: "municipal_commissioner", en: "Municipal Commissioner", hi: "नगर आयुक्त", singleSeat: true },
  { key: "deputy_municipal_commissioner", en: "Deputy Municipal Commissioner", hi: "उप नगर आयुक्त", singleSeat: false },
  { key: "city_manager", en: "City Manager", hi: "सिटी मैनेजर", singleSeat: false },
  { key: "apswmo", en: "APSWMO", hi: "एपीएसडब्ल्यूएमओ", singleSeat: false },
  { key: "assistant_architect", en: "Assistant Architect", hi: "सहायक वास्तुविद", singleSeat: false },
  { key: "assistant_town_planning_supervisor", en: "Assistant Town Planning Supervisor", hi: "सहायक नगर योजना पर्यवेक्षक", singleSeat: false },
  { key: "head_clerk", en: "Head Clerk", hi: "प्रधान लिपिक", singleSeat: false },
  { key: "ward_councillor", en: "Ward Councillor", hi: "वार्ड पार्षद", singleSeat: true },
] as const;

export type WhosWhoDesignation = (typeof WHOS_WHO_DESIGNATIONS)[number]["key"];
export const WHOS_WHO_DESIGNATION_KEYS = WHOS_WHO_DESIGNATIONS.map((d) => d.key) as unknown as [WhosWhoDesignation, ...WhosWhoDesignation[]];

export const WHOS_WHO_WARD_COUNT = 45;
export const WHOS_WHO_MESSAGE_MAX_WORDS = 60;

/** Items the City Manager must tick before forwarding - Part C of the paper form. */
export const WHOS_WHO_VERIFICATION_CHECKS = [
  { key: "name", label: "Name spelling (English and Hindi) matches the form" },
  { key: "designation", label: "Designation and Ward No. are correct" },
  { key: "date", label: "Date of assuming office matches the supporting document" },
  { key: "photo", label: "Photograph matches the official" },
  { key: "contact", label: "Contact number checked by calling" },
  { key: "message", label: "Public message follows the guidelines" },
  { key: "consent", label: "Consent in Part A is signed" },
] as const;

export type WhosWhoStatus = "pending_verification" | "pending_publication" | "returned" | "published" | "archived";

/** Row without photo / form bytes. */
export interface WhosWhoMeta {
  id: string;
  designation: WhosWhoDesignation;
  ward_no: number | null;
  area_charge: string | null;
  name_en: string;
  name_hi: string | null;
  date_assumed_office: string; // YYYY-MM-DD
  contact_number: string;
  contact_is_personal: boolean;
  email: string | null;
  public_message: string | null;
  form_no: string | null;
  signed_form_name: string;
  status: WhosWhoStatus;
  replaces_id: string | null;
  entered_by: string;
  entered_by_key: string;
  entered_at: Date;
  verified_by: string | null;
  verified_at: Date | null;
  verification_checks: Record<string, boolean> | null;
  published_by: string | null;
  published_at: Date | null;
  returned_by: string | null;
  returned_at: Date | null;
  return_reason: string | null;
  archived_by: string | null;
  archived_at: Date | null;
  updated_at: Date;
}

/** What the public page gets - no workflow or audit fields. */
export interface WhosWhoPublic {
  id: string;
  designation: WhosWhoDesignation;
  ward_no: number | null;
  area_charge: string | null;
  name_en: string;
  name_hi: string | null;
  date_assumed_office: string;
  contact_number: string;
  email: string | null;
  public_message: string | null;
  photo_version: string;
}
