import { Router } from "express";
import rateLimit from "express-rate-limit";
import { getPyauMyReports, getPyauWard, getPyauWards, postPyauFault } from "../controllers/publicPyauFault.controller";

/**
 * Public reporting of non-working submersibles (pyaus). The citizen first verifies with holding number + registered
 * mobile at POST /public/streetlights/session; the same session token works here.
 */
export const publicSubmersibleRouter = Router();

const base = { standardHeaders: true, legacyHeaders: false } as const;
const readLimit = rateLimit({ ...base, windowMs: 15 * 60 * 1000, max: 300, message: { error: "Too many requests. Please wait a few minutes." } });
const reportLimit = rateLimit({ ...base, windowMs: 60 * 60 * 1000, max: 20, message: { error: "Too many reports. Please try again later." } });

publicSubmersibleRouter.get("/wards", readLimit, getPyauWards);
publicSubmersibleRouter.get("/wards/:id", readLimit, getPyauWard);
publicSubmersibleRouter.post("/faults", reportLimit, postPyauFault);
publicSubmersibleRouter.get("/my-reports", readLimit, getPyauMyReports);
