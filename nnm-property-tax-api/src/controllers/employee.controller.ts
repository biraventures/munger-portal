import type { Request, Response } from "express";
import { z } from "zod";
import ExcelJS from "exceljs";
import { createEmployee, findEmployeeByAadhaar, updateEmployee, deleteEmployee, verifyEmployee } from "../services/employee.service";
import { employeeRepository } from "../repositories/employee.repository";
import {
  calculateYearsOfService,
  RESERVATION_CATEGORY_LABELS,
  EDUCATIONAL_QUALIFICATION_LABELS,
  APPOINTING_AUTHORITY_LABELS,
  EMPLOYMENT_TYPE_LABELS,
} from "../types/employee.types";
import { asyncHandler } from "../middleware/asyncHandler";
import { addSheetFromRows } from "../services/export.service";
import { ApiError } from "../utils/ApiError";
import type { EmployeeRow } from "../types/employee.types";

function withYearsOfService(employee: EmployeeRow) {
  return { ...employee, yearsOfService: calculateYearsOfService(employee.date_of_appointment, employee.unauthorised_absence_days) };
}

/** Shared by create and update - same field set either way. */
const employeeFieldsSchema = z.object({
  name: z.string().trim().min(1),
  fatherName: z.string().trim().nullish(),
  husbandName: z.string().trim().nullish(),
  homeDistrict: z.string().trim().min(1),
  dateOfBirth: z.string().trim().min(1),
  aadhaarNumber: z.string().trim().min(1),
  panNumber: z.string().trim().nullish(),
  reservationCategory: z.enum(["scheduled_caste", "scheduled_tribe", "other_backward_class", "extremely_backward_class", "backward_class_women", "divyang", "general"]),
  educationalQualification: z.enum(["no_formal_education", "below_matric", "matriculation", "intermediate", "diploma_degree"]),
  dateOfAppointment: z.string().trim().min(1),
  appointmentOrderNumber: z.string().trim().nullish(),
  appointingAuthority: z.enum(["government_of_bihar", "munger_municipal_corporation"]),
  employmentType: z.enum(["permanent", "contractual", "daily_wage"]),
  epfUan: z.string().trim().nullish(),
  unauthorisedAbsenceDays: z.coerce.number().int().min(0).default(0),
  municipalBoardRecommendation: z.coerce.boolean().default(false),
  proceedingNumber: z.string().trim().nullish(),
  proceedingDate: z.string().trim().nullish(),
});

function toFieldsInput(data: z.infer<typeof employeeFieldsSchema>) {
  return {
    name: data.name,
    fatherName: data.fatherName ?? null,
    husbandName: data.husbandName ?? null,
    homeDistrict: data.homeDistrict,
    dateOfBirth: data.dateOfBirth,
    aadhaarNumber: data.aadhaarNumber,
    panNumber: data.panNumber ?? null,
    reservationCategory: data.reservationCategory,
    educationalQualification: data.educationalQualification,
    dateOfAppointment: data.dateOfAppointment,
    appointmentOrderNumber: data.appointmentOrderNumber ?? null,
    appointingAuthority: data.appointingAuthority,
    employmentType: data.employmentType,
    epfUan: data.epfUan ?? null,
    unauthorisedAbsenceDays: data.unauthorisedAbsenceDays,
    municipalBoardRecommendation: data.municipalBoardRecommendation,
    proceedingNumber: data.municipalBoardRecommendation ? (data.proceedingNumber?.trim() ?? null) : null,
    proceedingDate: data.municipalBoardRecommendation ? (data.proceedingDate ?? null) : null,
  };
}

export const postCreateEmployeeHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = employeeFieldsSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Invalid input", parsed.error.flatten().fieldErrors);

  const employee = await createEmployee({ ...toFieldsInput(parsed.data), createdBy: req.admin!.displayName });
  res.status(200).json({ employee: withYearsOfService(employee) });
});

const searchQuerySchema = z.object({ aadhaar: z.string().trim().min(1) });

/** GET /api/v1/admin/employees/search?aadhaar=... - fetches a record for correction, deletion, or to confirm none exists yet (so the Clerk knows to add a new one instead). */
export const searchEmployeeByAadhaarHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = searchQuerySchema.safeParse(req.query);
  if (!parsed.success) throw ApiError.badRequest("Invalid query");
  const employee = await findEmployeeByAadhaar(parsed.data.aadhaar);
  res.status(200).json({ employee: employee ? withYearsOfService(employee) : null });
});

const listQuerySchema = z.object({ status: z.enum(["pending_verification", "verified"]).optional() });

export const listEmployeesHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) throw ApiError.badRequest("Invalid query");
  const employees = await employeeRepository.listAll(parsed.data.status);
  res.status(200).json({ employees: employees.map(withYearsOfService) });
});

const STATUS_LABELS: Record<"pending_verification" | "verified", string> = {
  pending_verification: "Pending Verification",
  verified: "Verified",
};

/**
 * GET /api/v1/admin/employees/export - the full staff list as .xlsx,
 * with every record's verification status/who-verified-it/when visible
 * in one sheet. Open to the same three roles that can view the list at
 * all (Establishment Clerk, City Manager, Commissioner - see
 * requireEmployeeViewRole in admin.routes.ts) - there's only ONE
 * verification stage in this schema (the City Manager's), not a
 * separate per-role sign-off, so all three download the same sheet
 * rather than three different filtered ones. An optional ?status=
 * filter narrows it to just pending or just verified, for whoever
 * wants that instead of the full list.
 */
export const exportEmployeesHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) throw ApiError.badRequest("Invalid query");
  const employees = await employeeRepository.listAll(parsed.data.status);

  const rows = employees.map((e) => {
    const yearsOfService = calculateYearsOfService(e.date_of_appointment, e.unauthorised_absence_days);
    return {
      "Name": e.name,
      "Father Name": e.father_name ?? "",
      "Husband Name": e.husband_name ?? "",
      "Home District": e.home_district,
      "Date of Birth": e.date_of_birth,
      "Aadhaar Number": e.aadhaar_number,
      "PAN Number": e.pan_number ?? "",
      "Reservation Category": RESERVATION_CATEGORY_LABELS[e.reservation_category],
      "Educational Qualification": EDUCATIONAL_QUALIFICATION_LABELS[e.educational_qualification],
      "Date of Appointment": e.date_of_appointment,
      "Appointment Order Number": e.appointment_order_number ?? "",
      "Appointing Authority": APPOINTING_AUTHORITY_LABELS[e.appointing_authority],
      "Employment Type": EMPLOYMENT_TYPE_LABELS[e.employment_type],
      "EPF/UAN": e.epf_uan ?? "",
      "Unauthorised Absence (days)": e.unauthorised_absence_days,
      "Years of Service": `${yearsOfService.years}y ${yearsOfService.months}m`,
      "Municipal Board Recommendation": e.municipal_board_recommendation ? "Yes" : "No",
      "Proceeding Number": e.proceeding_number ?? "",
      "Proceeding Date": e.proceeding_date ?? "",
      "Status": STATUS_LABELS[e.status],
      "Entered By (Establishment Clerk)": e.created_by,
      "Entered On": e.created_at,
      "Verified By (City Manager)": e.verified_by ?? "",
      "Verified On": e.verified_at ?? "",
    };
  });

  const workbook = new ExcelJS.Workbook();
  addSheetFromRows(workbook, "Employee Database", rows);

  const suffix = parsed.data.status ? `-${parsed.data.status}` : "";
  const filename = `employee-database${suffix}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
});

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

/** PATCH /api/v1/admin/employees/:id - corrects an existing record. If it was verified, this resets it to pending_verification for re-checking. */
export const patchUpdateEmployeeHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = idParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid employee id");
  const bodyParsed = employeeFieldsSchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input", bodyParsed.error.flatten().fieldErrors);

  const employee = await updateEmployee(paramsParsed.data.id, toFieldsInput(bodyParsed.data));
  res.status(200).json({ employee: withYearsOfService(employee) });
});

export const deleteEmployeeHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid employee id");
  await deleteEmployee(parsed.data.id);
  res.status(200).json({ success: true });
});

export const postVerifyEmployeeHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid employee id");
  const employee = await verifyEmployee(parsed.data.id, req.admin!.displayName);
  res.status(200).json({ employee: withYearsOfService(employee) });
});

/** Commissioner's progress view - how many records have been entered and verified so far. */
export const getEmployeeDatabaseProgressHandler = asyncHandler(async (_req: Request, res: Response) => {
  const counts = await employeeRepository.progressCounts();
  res.status(200).json(counts);
});
