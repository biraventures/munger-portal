import { Router } from "express";
import { requireDocumentUser } from "../middleware/requireDocumentUser";
import {
  decideDocument,
  getDocumentFileForUser,
  getDocumentMe,
  listDocumentsForUser,
  postDocument,
} from "../controllers/documentManager.controller";

export const documentManagerRouter = Router();

// Shared by the admin, operator and attendance logins - see requireDocumentUser for who gets in.
documentManagerRouter.use(requireDocumentUser);
documentManagerRouter.get("/me", getDocumentMe);
documentManagerRouter.get("/documents", listDocumentsForUser);
documentManagerRouter.post("/documents", postDocument);
documentManagerRouter.get("/documents/:id/file", getDocumentFileForUser);
documentManagerRouter.post("/documents/:id/approve", decideDocument(true));
documentManagerRouter.post("/documents/:id/reject", decideDocument(false));
