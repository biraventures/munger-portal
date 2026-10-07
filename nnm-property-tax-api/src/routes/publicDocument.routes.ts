import { Router } from "express";
import { listPublicDocumentsHandler, getPublicDocumentFileHandler } from "../controllers/publicDocument.controller";

// Deliberately no auth middleware - these are the documents the
// Commissioner chose to publish on the public website. Management
// (upload/edit/delete) lives under /admin/public-documents instead.
export const publicDocumentRouter = Router();

publicDocumentRouter.get("/", listPublicDocumentsHandler);
publicDocumentRouter.get("/:id/file", getPublicDocumentFileHandler);
