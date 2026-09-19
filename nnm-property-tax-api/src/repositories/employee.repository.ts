import { pool } from "../config/db";
import type { EmployeeRow, ReservationCategory, EducationalQualification, AppointingAuthority, EmploymentType } from "../types/employee.types";

export interface EmployeeFieldsInput {
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
  municipalBoardRecommendation: boolean;
  proceedingNumber: string | null;
  proceedingDate: string | null;
}

export interface CreateEmployeeInput extends EmployeeFieldsInput {
  createdBy: string;
}

const COLUMNS = `id, name, father_name, husband_name, home_district, date_of_birth, aadhaar_number, pan_number,
                  reservation_category, educational_qualification, date_of_appointment, appointment_order_number,
                  appointing_authority, employment_type, epf_uan, unauthorised_absence_days, municipal_board_recommendation, proceeding_number, proceeding_date,
                  status, created_by, created_at, verified_by, verified_at, deleted_at`;

function fieldParams(input: EmployeeFieldsInput): unknown[] {
  return [
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
    input.municipalBoardRecommendation,
    input.proceedingNumber,
    input.proceedingDate,
  ];
}

export const employeeRepository = {
  async findById(id: number): Promise<EmployeeRow | null> {
    const { rows } = await pool.query<EmployeeRow>(`SELECT ${COLUMNS} FROM employees WHERE id = $1 AND deleted_at IS NULL`, [id]);
    return rows[0] ?? null;
  },

  /** Exact match on Aadhaar number - what the Establishment Clerk's search uses to fetch a record for correction/deletion. */
  async findByAadhaar(aadhaarNumber: string): Promise<EmployeeRow | null> {
    const { rows } = await pool.query<EmployeeRow>(`SELECT ${COLUMNS} FROM employees WHERE aadhaar_number = $1 AND deleted_at IS NULL`, [aadhaarNumber]);
    return rows[0] ?? null;
  },

  async create(input: CreateEmployeeInput): Promise<EmployeeRow> {
    const { rows } = await pool.query<EmployeeRow>(
      `INSERT INTO employees (
        name, father_name, husband_name, home_district, date_of_birth, aadhaar_number, pan_number,
        reservation_category, educational_qualification, date_of_appointment, appointment_order_number,
        appointing_authority, employment_type, epf_uan, unauthorised_absence_days, municipal_board_recommendation, proceeding_number, proceeding_date, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
      RETURNING ${COLUMNS}`,
      [...fieldParams(input), input.createdBy],
    );
    return rows[0]!;
  },

  /**
   * Corrects an existing record. If it was already verified, this
   * resets it to pending_verification - the corrected data hasn't
   * been checked by the City Manager yet, so it shouldn't keep
   * showing as verified on the strength of the old values.
   */
  async update(id: number, input: EmployeeFieldsInput): Promise<EmployeeRow | null> {
    const { rows } = await pool.query<EmployeeRow>(
      `UPDATE employees SET
        name = $2, father_name = $3, husband_name = $4, home_district = $5, date_of_birth = $6, aadhaar_number = $7, pan_number = $8,
        reservation_category = $9, educational_qualification = $10, date_of_appointment = $11, appointment_order_number = $12,
        appointing_authority = $13, employment_type = $14, epf_uan = $15, unauthorised_absence_days = $16,
        municipal_board_recommendation = $17, proceeding_number = $18, proceeding_date = $19,
        status = 'pending_verification', verified_by = NULL, verified_at = NULL
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING ${COLUMNS}`,
      [id, ...fieldParams(input)],
    );
    return rows[0] ?? null;
  },

  async softDelete(id: number): Promise<EmployeeRow | null> {
    const { rows } = await pool.query<EmployeeRow>(
      `UPDATE employees SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING ${COLUMNS}`,
      [id],
    );
    return rows[0] ?? null;
  },

  async listAll(status?: "pending_verification" | "verified"): Promise<EmployeeRow[]> {
    if (status) {
      const { rows } = await pool.query<EmployeeRow>(`SELECT ${COLUMNS} FROM employees WHERE status = $1 AND deleted_at IS NULL ORDER BY created_at DESC`, [status]);
      return rows;
    }
    const { rows } = await pool.query<EmployeeRow>(`SELECT ${COLUMNS} FROM employees WHERE deleted_at IS NULL ORDER BY created_at DESC`);
    return rows;
  },

  async verify(id: number, verifiedBy: string): Promise<EmployeeRow | null> {
    const { rows } = await pool.query<EmployeeRow>(
      `UPDATE employees SET status = 'verified', verified_by = $2, verified_at = now()
       WHERE id = $1 AND status = 'pending_verification' AND deleted_at IS NULL
       RETURNING ${COLUMNS}`,
      [id, verifiedBy],
    );
    return rows[0] ?? null;
  },

  /** Total and verified counts - the Commissioner's progress view. */
  async progressCounts(): Promise<{ total: number; verified: number; pending: number }> {
    const { rows } = await pool.query<{ total: string; verified: string }>(
      `SELECT COUNT(*)::text AS total, COUNT(*) FILTER (WHERE status = 'verified')::text AS verified FROM employees WHERE deleted_at IS NULL`,
    );
    const total = parseInt(rows[0]!.total, 10);
    const verified = parseInt(rows[0]!.verified, 10);
    return { total, verified, pending: total - verified };
  },
};
