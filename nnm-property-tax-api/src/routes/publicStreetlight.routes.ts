import { Router } from "express";
import rateLimit from "express-rate-limit";
import { getMyReports, getSegmentLights, getWard, getWards, postFault, postSession } from "../controllers/publicLightFault.controller";

/** Public reporting of non-working streetlights / High Masts (holding number + registered mobile). */
export const publicStreetlightRouter = Router();

const base = { standardHeaders: true, legacyHeaders: false } as const;
// Only failed holding + mobile attempts count, so they cannot be guessed.
const sessionLimit = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  requestWasSuccessful: (_req, res) => res.locals.sessionOk === true,
  message: { error: "Too many attempts. Please wait 15 minutes." },
});
const readLimit = rateLimit({ ...base, windowMs: 15 * 60 * 1000, max: 300, message: { error: "Too many requests. Please wait a few minutes." } });
const reportLimit = rateLimit({ ...base, windowMs: 60 * 60 * 1000, max: 40, message: { error: "Too many reports. Please try again later." } });

publicStreetlightRouter.post("/session", sessionLimit, postSession);
publicStreetlightRouter.get("/wards", readLimit, getWards);
publicStreetlightRouter.get("/wards/:id", readLimit, getWard);
publicStreetlightRouter.get("/segments/:id/lights", readLimit, getSegmentLights);
publicStreetlightRouter.post("/faults", reportLimit, postFault);
publicStreetlightRouter.get("/my-reports", readLimit, getMyReports);
