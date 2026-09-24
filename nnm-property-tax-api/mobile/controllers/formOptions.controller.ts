import type { Request, Response } from "express";
import { PERIOD_OF_ASSESSMENT_BUCKETS, PRESENT_CATEGORY_OPTIONS, SOLID_WASTE_RATE, USE_TYPE_MULTIPLIER } from "../constants/taxRates";

/** GET /api/v1/form-options — port of getFormOptions() from Code.gs. */
export function getFormOptions(_req: Request, res: Response): void {
  res.status(200).json({
    roadTypes: ["PMR", "MR", "OR"],
    constTypes: ["RCC", "Asbestos", "Other"],
    occupancyTypes: ["self", "rented"],
    relationTypes: ["S/O", "D/O", "W/O", "C/O"],
    usageTypes: Object.keys(USE_TYPE_MULTIPLIER),
    solidWasteChargeTypes: Object.keys(SOLID_WASTE_RATE),
    solidWasteRates: SOLID_WASTE_RATE,
    presentCategories: PRESENT_CATEGORY_OPTIONS,
    changeBasisOptions: ["Resurvey/Reassessment", "New Self-Assessment", "Mutation", "Minor Clerical Editing"],
    periodsOfAssessment: Object.keys(PERIOD_OF_ASSESSMENT_BUCKETS),
  });
}