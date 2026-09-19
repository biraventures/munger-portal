import { pool } from "../config/db";
import type { EmployeeRow, ReservationCategory, EducationalQualification, AppointingAuthority, EmploymentType } from "../types/employee.types";

export interface CreateEmployeeInput {
  name: string;
  fatherName: string | null;
  husbandName: string | null;
  homeDistrict: string;
  dateOfBirth: string;
  aadhaarNumber: string;
  panNumber: string | null;
  reservationCategory: ReservationCategory;
  educationalQualification: EducationalQualification;
  dateOfAppointment: string;
  appointmentOrderNumber: string | null;
  appointingAuthority: AppointingAuthority;
  employmentType: EmploymentType;
  epfUan: string | null;
  unauthorisedAbsenceDays: number;
  createdBy: string;
}

const COLUMNS = `id, name, father_name, husband_name, home_district, date_of_birth, aadhaar_number, pan_number,
                  reservation_category, educational_qualification, date_of_appointment, appointment_order_number,
                  appointing_authority, employment_type, epf_uan, unauthorised_absence_days, status, created_by, created_at, verified_by, verified_at`;

export const employeeRepository = {
  async findById(id: number): Promise<EmployeeRow | null> {
    const { rows } = await pool.query<EmployeeRow>(`SELECT ${COLUMNS} FROM employees WHERE id = $1`, [id]);
    return rows[0] ?? null;
  },

  async create(input: CreateEmployeeInput): Promise<EmployeeRow> {
    const { rows } = await pool.query<EmployeeRow>(
      `INSERT INTO employees (
        name, father_name, husband_name, home_district, date_of_birth, aadhaar_number, pan_number,
        reservation_category, educational_qualification, date_of_appointment, appointment_order_number,
        appointing_authority, employment_type, epf_uan, unauthorised_absence_days, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      RETURNING ${COLUMNS}`,
      [
        input.name,
        input.fatherName,
        input.husbandName,
        input.homeDistrict,
        input.dateOfBirth,
        input.aadhaarNumber,
        input.panNumber,
        input.reservationCategory,
        input.educationalQualification,
        input.dateOfAppointment,
        input.appointmentOrderNumber,
        input.appointingAuthority,
        input.employmentType,
        input.epfUan,
        input.unauthorisedAbsenceDays,
        input.createdBy,
      ],
    );
    return rows[0]!;
  },

  async listAll(status?: "pending_verification" | "verified"): Promise<EmployeeRow[]> {
    if (status) {
      const { rows } = await pool.query<EmployeeRow>(`SELECT ${COLUMNS} FROM employees WHERE status = $1 ORDER BY created_at DESC`, [status]);
      return rows;
    }
    const { rows } = await pool.query<EmployeeRow>(`SELECT ${COLUMNS} FROM employees ORDER BY created_at DESC`);
    return rows;
  },

  async verify(id: number, verifiedBy: string): Promise<EmployeeRow | null> {
    const { rows } = await pool.query<EmployeeRow>(
      `UPDATE employees SET status = 'verified', verified_by = $2, verified_at = now()
       WHERE id = $1 AND status = 'pending_verification'
       RETURNING ${COLUMNS}`,
      [id, verifiedBy],
    );
    return rows[0] ?? null;
  },

  /** Total and verified counts - the Commissioner's progress view. */
  async progressCounts(): Promise<{ total: number; verified: number; pending: number }> {
    const { rows } = await pool.query<{ total: string; verified: string }>(
      `SELECT COUNT(*)::text AS total, COUNT(*) FILTER (WHERE status = 'verified')::text AS verified FROM employees`,
    );
    const total = parseInt(rows[0]!.total, 10);
    const verified = parseInt(rows[0]!.verified, 10);
    return { total, verified, pending: total - verified };
  },
};
