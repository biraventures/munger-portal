export type ReservationCategory = "scheduled_caste" | "scheduled_tribe" | "other_backward_class" | "extremely_backward_class" | "backward_class_women" | "divyang" | "general";
export type EducationalQualification = "below_matric" | "matriculation" | "intermediate" | "diploma_degree";
export type AppointingAuthority = "government_of_bihar" | "munger_municipal_corporation";
export type EmploymentType = "permanent" | "contractual" | "daily_wage";
export type EmployeeStatus = "pending_verification" | "verified";

export const RESERVATION_CATEGORY_LABELS: Record<ReservationCategory, string> = {
  scheduled_caste: "Scheduled Caste",
  scheduled_tribe: "Scheduled Tribe",
  other_backward_class: "Other Backward Class",
  extremely_backward_class: "Extremely Backward Class",
  backward_class_women: "Backward Class Women",
  divyang: "Divyang",
  general: "General",
};

export const EDUCATIONAL_QUALIFICATION_LABELS: Record<EducationalQualification, string> = {
  below_matric: "Below Matric",
  matriculation: "Matriculation",
  intermediate: "Intermediate",
  diploma_degree: "Diploma/Degree",
};

export const APPOINTING_AUTHORITY_LABELS: Record<AppointingAuthority, string> = {
  government_of_bihar: "Government of Bihar",
  munger_municipal_corporation: "Munger Municipal Corporation",
};

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  permanent: "Permanent",
  contractual: "Contractual",
  daily_wage: "Daily Wage",
};

export interface EmployeeRow {
  id: number;
  name: string;
  father_name: string | null;
  husband_name: string | null;
  home_district: string;
  date_of_birth: string;
  aadhaar_number: string;
  pan_number: string | null;
  reservation_category: ReservationCategory;
  educational_qualification: EducationalQualification;
  date_of_appointment: string;
  appointment_order_number: string | null;
  appointing_authority: AppointingAuthority;
  employment_type: EmploymentType;
  epf_uan: string | null;
  unauthorised_absence_days: number;
  status: EmployeeStatus;
  created_by: string;
  created_at: string;
  verified_by: string | null;
  verified_at: string | null;
}

/**
 * Years and months of service - computed from date_of_appointment
 * minus unauthorised_absence_days, per what was explicitly asked for
 * ("autocalculated ... by deducting unauthorised absence"). Not
 * stored, since it changes daily and a stored value would go stale
 * the moment it's saved.
 */
export function calculateYearsOfService(dateOfAppointment: string, unauthorisedAbsenceDays: number): { years: number; months: number } {
  const appointed = new Date(dateOfAppointment);
  const effectiveStart = new Date(appointed.getTime() + unauthorisedAbsenceDays * 86_400_000);
  const now = new Date();

  let years = now.getFullYear() - effectiveStart.getFullYear();
  let months = now.getMonth() - effectiveStart.getMonth();
  if (now.getDate() < effectiveStart.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years < 0) return { years: 0, months: 0 };
  return { years, months };
}
