import type { Request, Response } from "express";
import { bulkRegenerateAutomaticTaxHistoryStages } from "../services/automaticTaxHistory.service";
import { asyncHandler } from "../middleware/asyncHandler";

/**
 * POST /api/v1/admin/tax-history/bulk-regenerate
 * Admin-only — recomputes system-derived tax_history_stages for every
 * holding with floor data, from current Floors. One-off backfill for
 * holdings that existed before automatic regeneration was wired into the
 * save flow, or whenever stages need refreshing without a full
 * save-and-approval cycle. Never touches manually-entered/migrated rows
 * (auto_generated=FALSE) — see automaticTaxHistory.service.ts.
 */
export const postBulkRegenerateTaxHistory = asyncHandler(async (req: Request, res: Response) => {
  const actorDisplayName = req.admin ? req.admin.displayName : "System (Bulk Batch)";
  const result = await bulkRegenerateAutomaticTaxHistoryStages(actorDisplayName);
  res.status(200).json(result);
});