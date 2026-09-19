import type { Request, Response } from "express";
import { z } from "zod";
import { createEmployee, verifyEmployee } from "../services/employee.service";
import { employeeRepository } from "../repositories/employee.repository";
import { calculateYearsOfService } from "../types/employee.types";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";
import type { EmployeeRow } from "../types/employee.types";

function withYearsOfService(employee: EmployeeRow) {
  return { ...employee, yearsOfService: calculateYearsOfService(employee.date_of_appointment, employee.unauthorised_absence_days) };
}

const createEmployeeSchema = z.object({
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
});

export const postCreateEmployeeHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = createEmployeeSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Invalid input", parsed.error.flatten().fieldErrors);

  const employee = await createEmployee({
    name: parsed.data.name,
    fatherName: parsed.data.fatherName ?? null,
    husbandName: parsed.data.husbandName ?? null,
    homeDistrict: parsed.data.homeDistrict,
    dateOfBirth: parsed.data.dateOfBirth,
    aadhaarNumber: parsed.data.aadhaarNumber,
    panNumber: parsed.data.panNumber ?? null,
    reservationCategory: parsed.data.reservationCategory,
    educationalQualification: parsed.data.educationalQualification,
    dateOfAppointment: parsed.data.dateOfAppointment,
    appointmentOrderNumber: parsed.data.appointmentOrderNumber ?? null,
    appointingAuthority: parsed.data.appointingAuthority,
    employmentType: parsed.data.employmentType,
    epfUan: parsed.data.epfUan ?? null,
    unauthorisedAbsenceDays: parsed.data.unauthorisedAbsenceDays,
    createdBy: req.admin!.displayName,
  });

  res.status(200).json({ employee: withYearsOfService(employee) });
});

const listQuerySchema = z.object({ status: z.enum(["pending_verification", "verified"]).optional() });

export const listEmployeesHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) throw ApiError.badRequest("Invalid query");
  const employees = await employeeRepository.listAll(parsed.data.status);
  res.status(200).json({ employees: employees.map(withYearsOfService) });
});

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

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
