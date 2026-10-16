import { Router } from "express";
import { getReceiptsExport } from "../controllers/receiptExport.controller";
import { requireOperator } from "../middleware/requireOperator";
import { getMutationApplication, getMutationApplicationDocument } from "../controllers/mutationApplication.controller";

export const operatorRouter = Router();

operatorRouter.get("/receipts/export", requireOperator, getReceiptsExport);

// The online mutation application (and its documents) behind a change request sent back to the operator for correction.
operatorRouter.get("/mutation-applications/:id", requireOperator, getMutationApplication);
operatorRouter.get("/mutation-applications/:id/documents/:docId/file", requireOperator, getMutationApplicationDocument);
