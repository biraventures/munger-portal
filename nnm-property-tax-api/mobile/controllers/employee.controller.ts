import type { Request, Response } from "express";
import { z } from "zod";
import { createEmployee, findEmployeeByAadhaar, updateEmployee, deleteEmployee, verifyEmployee } from "../services/employee.service";
import { employeeRepository } from "../repositories/employee.repository";
import { calculateYearsOfService } from "../types/employee.types";
import { asyncHandler } from "../middleware/asyncHandler";
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
  educationalQualification: z.enum(["below_matric", "matriculation", "intermediate", "diploma_degree"]),
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
