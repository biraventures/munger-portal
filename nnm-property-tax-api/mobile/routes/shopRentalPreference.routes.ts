import { Router } from "express";
import { postSubmitRentalPreference, postSubmitPublicRentalPreference } from "../controllers/shopRentalPreference.controller";
import { requireOperator } from "../middleware/requireOperator";

export const shopRentalPreferenceRouter = Router();

// POST /api/v1/shop-rental-preferences/public - MUST come before the operator-only POST / below.
shopRentalPreferenceRouter.post("/public", postSubmitPublicRentalPreference);

// POST /api/v1/shop-rental-preferences - operator only, on the applicant's behalf.
shopRentalPreferenceRouter.post("/", requireOperator, postSubmitRentalPreference);
