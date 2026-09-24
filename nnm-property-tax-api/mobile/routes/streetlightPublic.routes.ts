import { Router } from "express";
import { submitStreetlightGrievanceHandler } from "../controllers/streetlightPublic.controller";

// Deliberately no auth middleware on this router - a member of the
// public reporting a non-functional light with just their phone
// number and the light's GPS location, no login required.
export const streetlightPublicRouter = Router();

streetlightPublicRouter.post("/", submitStreetlightGrievanceHandler);
