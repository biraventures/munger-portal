import type { Request, Response } from "express";
import { adminRepository } from "../repositories/admin.repository";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

/**
 * GET /api/v1/tax-collectors/lookup/:code - deliberately public, no auth.
 * Resolves a code to a name against the real Tax Collector LOGIN
 * accounts (admins.role = 'tax_collector', see migration 088 and
 * scripts/create-admin.ts) - both the citizen-facing payment page and
 * the operator's payment form call this to verify a code as it's
 * entered. Returns 404 (not an empty 200) for "not found/inactive",
 * so the UI can show "code not verified" distinctly from "still
 * checking".
 */
export const lookupTaxCollector = asyncHandler(async (req: Request, res: Response) => {
  const code = String(req.params.code ?? "").trim();
  if (!code) throw ApiError.badRequest("Provide a tax collector code.");

  const collector = await adminRepository.findActiveTaxCollectorByCode(code);
  if (!collector) throw ApiError.notFound("No active tax collector with that code.");

  res.status(200).json({ code: collector.tax_collector_code, name: collector.display_name });
});

/**
 * GET /api/v1/tax-collectors/active - deliberately public, no auth.
 * Powers the code+name dropdown on the operator's counter-payment
 * form (see TaxCollectorCodeInput) - only active Tax Collector login
 * accounts with a generated code are exposed here.
 */
export const listActiveTaxCollectors = asyncHandler(async (_req: Request, res: Response) => {
  const collectors = await adminRepository.listActiveTaxCollectorCodes();
  res.status(200).json({ collectors });
});
