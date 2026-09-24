import { Router } from "express";
import { postSubmitRentalApplication, postSubmitPublicRentalApplication } from "../controllers/shopRentalApplication.controller";
import { requireOperator } from "../middleware/requireOperator";

export const shopRentalApplicationRouter = Router();

// POST /api/v1/shop-rental-applications/public — MUST come before the
// operator-only POST / below, or "public" would need its own distinct
// segment (it does — "/public" vs "/" — but keeping order consistent
// with the rest of this codebase's routing conventions).
shopRentalApplicationRouter.post("/public", postSubmitPublicRentalApplication);

// POST /api/v1/shop-rental-applications — operator only, target shop must be vacant
shopRentalApplicationRouter.post("/", requireOperator, postSubmitRentalApplication);