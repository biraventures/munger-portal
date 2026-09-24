import { Router } from "express";
import { lookupTaxCollector, listActiveTaxCollectors } from "../controllers/taxCollector.controller";

export const taxCollectorRouter = Router();

// Deliberately public - both the citizen-facing payment page and the
// operator's payment form need to resolve a code to a name without
// requiring either kind of login.
taxCollectorRouter.get("/lookup/:code", lookupTaxCollector);

// Deliberately public too - powers the dropdown that replaces free-text code entry on both forms.
taxCollectorRouter.get("/active", listActiveTaxCollectors);