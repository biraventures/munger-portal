import { employeeRepository, type CreateEmployeeInput, type EmployeeFieldsInput } from "../repositories/employee.repository";
import { ApiError } from "../utils/ApiError";
import type { EmployeeRow } from "../types/employee.types";

function validateDates(dateOfBirth: string, dateOfAppointment: string): void {
  const dob = new Date(dateOfBirth);
  const doa = new Date(dateOfAppointment);
  if (Number.isNaN(dob.getTime())) throw ApiError.badRequest("Invalid date of birth.");
  if (Number.isNaN(doa.getTime())) throw ApiError.badRequest("Invalid date of appointment.");
  if (doa.getTime() > Date.now()) throw ApiError.badRequest("Date of appointment can't be in the future.");
  if (doa.getTime() < dob.getTime()) throw ApiError.badRequest("Date of appointment can't be before date of birth.");
  const ageAtAppointmentMs = doa.getTime() - dob.getTime();
  const eighteenYearsMs = 18 * 365.25 * 86_400_000;
  if (ageAtAppointmentMs < eighteenYearsMs) {
    throw ApiError.badRequest("Date of appointment implies an age under 18 - please double-check these dates.");
  }
}

/** Shared by create and update - the same set of checks applies whether this is a brand-new record or a correction to an existing one. */
function validateFields(input: EmployeeFieldsInput): void {
  if (!input.name.trim()) throw ApiError.badRequest("Name is required.");
  if (!input.homeDistrict.trim()) throw ApiError.badRequest("Home district is required.");
  if (!/^[0-9]{12}$/.test(input.aadhaarNumber)) throw ApiError.badRequest("Aadhaar number must be exactly 12 digits.");
  if (input.panNumber && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(input.panNumber)) {
    throw ApiError.badRequest("PAN number format looks invalid (expected e.g. ABCDE1234F).");
  }
  validateDates(input.dateOfBirth, input.dateOfAppointment);

  if (input.municipalBoardRecommendation) {
    if (!input.proceedingNumber?.trim()) throw ApiError.badRequest("Proceeding number is required when Municipal Board recommendation is yes.");
    if (!input.proceedingDate) throw ApiError.badRequest("Proceeding date is required when Municipal Board recommendation is yes.");
    if (Number.isNaN(new Date(input.proceedingDate).getTime())) throw ApiError.badRequest("Invalid proceeding date.");
  }
}

export async function createEmployee(input: CreateEmployeeInput): Promise<EmployeeRow> {
  validateFields(input);
  return employeeRepository.create(input);
}

/** Search by Aadhaar number - what the Establishment Clerk's "search for correction/addition/deletion" flow uses. Returns null (not an error) when nothing matches, so the caller can offer to add a new record instead. */
export async function findEmployeeByAadhaar(aadhaarNumber: string): Promise<EmployeeRow | null> {
  if (!/^[0-9]{12}$/.test(aadhaarNumber)) throw ApiError.badRequest("Aadhaar number must be exactly 12 digits.");
  return employeeRepository.findByAadhaar(aadhaarNumber);
}

export async function updateEmployee(id: number, input: EmployeeFieldsInput): Promise<EmployeeRow> {
  const existing = await employeeRepository.findById(id);
  if (!existing) throw ApiError.notFound("Employee record not found.");
  validateFields(input);

  const updated = await employeeRepository.update(id, input);
  if (!updated) throw ApiError.notFound("Employee record not found.");
  return updated;
}

export async function deleteEmployee(id: number): Promise<void> {
  const deleted = await employeeRepository.softDelete(id);
  if (!deleted) throw ApiError.notFound("Employee record not found.");
}

export async function verifyEmployee(id: number, verifiedBy: string): Promise<EmployeeRow> {
  const employee = await employeeRepository.findById(id);
  if (!employee) throw ApiError.notFound("Employee record not found.");
  if (employee.status !== "pending_verification") throw ApiError.badRequest("This record has already been verified.");

  const updated = await employeeRepository.verify(id, verifiedBy);
  if (!updated) throw ApiError.badRequest("This record is no longer awaiting verification.");
  return updated;
}
