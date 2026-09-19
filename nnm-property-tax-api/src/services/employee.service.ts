import { employeeRepository, type CreateEmployeeInput } from "../repositories/employee.repository";
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

export async function createEmployee(input: CreateEmployeeInput): Promise<EmployeeRow> {
  if (!input.name.trim()) throw ApiError.badRequest("Name is required.");
  if (!input.homeDistrict.trim()) throw ApiError.badRequest("Home district is required.");
  if (!/^[0-9]{12}$/.test(input.aadhaarNumber)) throw ApiError.badRequest("Aadhaar number must be exactly 12 digits.");
  if (input.panNumber && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(input.panNumber)) {
    throw ApiError.badRequest("PAN number format looks invalid (expected e.g. ABCDE1234F).");
  }
  validateDates(input.dateOfBirth, input.dateOfAppointment);

  return employeeRepository.create(input);
}

export async function verifyEmployee(id: number, verifiedBy: string): Promise<EmployeeRow> {
  const employee = await employeeRepository.findById(id);
  if (!employee) throw ApiError.notFound("Employee record not found.");
  if (employee.status !== "pending_verification") throw ApiError.badRequest("This record has already been verified.");

  const updated = await employeeRepository.verify(id, verifiedBy);
  if (!updated) throw ApiError.badRequest("This record is no longer awaiting verification.");
  return updated;
}
