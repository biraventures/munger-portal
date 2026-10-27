import { Router } from "express";
import rateLimit from "express-rate-limit";
import * as c from "../controllers/buildingPermit.controller";

/** Public building plan permit window - no login. Rate-limited so applications cannot be stepped through. */
export const publicBuildingPermitRouter = Router();

const base = { standardHeaders: true, legacyHeaders: false } as const;
const createLimit = rateLimit({ ...base, windowMs: 60 * 60 * 1000, max: 10, message: { error: "Too many applications from this connection. Please try again later." } });
const uploadLimit = rateLimit({ ...base, windowMs: 60 * 60 * 1000, max: 150, message: { error: "Too many uploads. Please try again later." } });
// Only misses count, so the application number + mobile pair cannot be guessed.
const lookupLimit = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  max: 20,
  skipSuccessfulRequests: true,
  requestWasSuccessful: (_req, res) => res.statusCode < 400,
  message: { error: "Too many attempts. Please wait 15 minutes." },
});

publicBuildingPermitRouter.get("/fee-rates", c.getFeeRates);
publicBuildingPermitRouter.post("/calculate", c.postCalculate);
publicBuildingPermitRouter.post("/applications", createLimit, c.postCreate);
publicBuildingPermitRouter.put("/applications/:id", uploadLimit, c.putDetails);
publicBuildingPermitRouter.post("/applications/:id/documents", uploadLimit, c.postDocument);
publicBuildingPermitRouter.get("/applications/:id/documents", uploadLimit, c.getDocuments);
publicBuildingPermitRouter.delete("/applications/:id/documents/:docId", uploadLimit, c.deleteDocument);
publicBuildingPermitRouter.post("/applications/:id/submit", uploadLimit, c.postSubmit);
publicBuildingPermitRouter.post("/status", lookupLimit, c.postStatus);
publicBuildingPermitRouter.post("/permit-letter", lookupLimit, c.postPermitLetter);
publicBuildingPermitRouter.post("/permit-file", lookupLimit, c.postPermitFile);
publicBuildingPermitRouter.post("/pay/initiate", lookupLimit, c.postPayInitiate);
publicBuildingPermitRouter.post("/pay/callback", c.postPayCallback);
