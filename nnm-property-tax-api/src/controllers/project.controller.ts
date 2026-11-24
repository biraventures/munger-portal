import type { Request, Response } from "express";
import fs from "node:fs";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { ENGINEER_ROLES } from "../types/attendance.types";
import { PROJECT_CATEGORY_KEYS, PROJECT_MILESTONES, PROJECT_STAGES } from "../types/project.types";
import {
  addDocument,
  addPhoto,
  assignWards,
  auditTrail,
  createProject,
  deleteProject,
  engineerSetup,
  financialYears,
  filePath,
  getProject,
  listProjects,
  markGps,
  removeFile,
  setMonitors,
  stageCounts,
  updateProject,
  updateSite,
  wardReport,
} from "../services/project.service";
import { exportProjectsReport, importProjects, projectTemplate } from "../services/projectImport.service";

const user = (req: Request) => {
  if (!req.attendanceUser) throw new ApiError(401, "Not signed in.");
  return req.attendanceUser;
};
const parse = <S extends z.ZodTypeAny>(schema: S, data: unknown): z.output<S> => {
  const p = schema.safeParse(data);
  if (!p.success) throw ApiError.badRequest(p.error.issues[0]?.message ?? "Invalid input.", p.error.flatten());
  return p.data;
};
const parseId = (req: Request) => parse(z.object({ id: z.coerce.number().int().positive() }), req.params).id;

const text = z
  .string()
  .trim()
  .nullish()
  .transform((v) => v || null);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date (YYYY-MM-DD).")
  .nullish()
  .or(z.literal(""))
  .transform((v) => v || null);
const amount = z
  .union([z.coerce.number().nonnegative("Amounts cannot be negative."), z.literal("")])
  .nullish()
  .transform((v) => (v === "" || v === undefined ? null : v));

const pct = z
  .union([z.coerce.number().min(0, "Progress is 0 to 100.").max(100, "Progress is 0 to 100."), z.literal("")])
  .nullish()
  .transform((v) => (v === "" || v === undefined ? null : v));

const projectSchema = z.object({
  projectCode: text,
  name: z.string().trim().min(3, "Enter the name of the work."),
  // Blank = a city-wide work (no ward).
  wardId: z
    .union([z.coerce.number().int().positive(), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  locationText: text,
  schemeName: text,
  category: z.enum(PROJECT_CATEGORY_KEYS, { message: "Select the type of work." }),
  discipline: z
    .enum(["civil", "mechanical", "both"])
    .nullish()
    .transform((v) => v ?? null),
  financialYear: text,
  estimatedCost: amount,
  approvalNo: text,
  approvalDate: date,
  tenderNo: text,
  tenderDate: date,
  tenderFinalisedDate: date,
  agencyName: text,
  workOrderNo: text,
  workOrderDate: date,
  workOrderAmount: amount,
  targetCompletionDate: date,
  actualStartDate: date,
  actualCompletionDate: date,
  paymentAmount: amount,
  paymentDate: date,
  // Blank = work it out from the dates and progress.
  stage: z
    .union([z.enum(PROJECT_STAGES), z.literal("")])
    .nullish()
    .transform((v) => v || null),
  remarks: text,
  taSentDate: date,
  taDate: date,
  tsSentDate: date,
  tsDate: date,
  boqApprovalDate: date,
  techBidOpeningDate: date,
  csToEeDate: date,
  csToSeDate: date,
  csToCeDate: date,
  csToEicDate: date,
  techBidDisposalDate: date,
  bidderClaim: text,
  claimDisposalDate: date,
  finBidOpeningDate: date,
  finBidToEeDate: date,
  finBidToSeDate: date,
  finBidToCeDate: date,
  finBidToEicDate: date,
  workAwardedDate: date,
  agreementDate: date,
  componentProgressPct: pct,
  physicalProgressPct: pct,
  financialProgressPct: pct,
  eotReason: text,
  eotDate: date,
});

const filterSchema = z.object({
  wardId: z.coerce.number().int().nonnegative().optional(), // 0 = city-wide works
  stage: z.enum(PROJECT_STAGES).optional(),
  group: z.enum(["ongoing", "past"]).optional(),
  discipline: z.enum(["civil", "mechanical", "both"]).optional(),
  financialYear: z.string().trim().max(9).optional(),
  q: z.string().trim().max(100).optional(),
});
const filter = (req: Request) => parse(filterSchema, Object.fromEntries(Object.entries(req.query).filter(([, v]) => v !== "")));

export const listProjectsHandler = asyncHandler(async (req: Request, res: Response) => {
  const f = filter(req);
  const [projects, counts, years] = await Promise.all([listProjects(user(req), f), stageCounts(user(req), f), financialYears(user(req))]);
  res.json({ projects, counts, years });
});

export const wardReportHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ rows: await wardReport(user(req), filter(req)) });
});

export const getProjectHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json(await getProject(user(req), parseId(req)));
});

export const createProjectHandler = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json({ project: await createProject(user(req), parse(projectSchema, req.body)) });
});

export const updateProjectHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ project: await updateProject(user(req), parseId(req), parse(projectSchema, req.body)) });
});

export const deleteProjectHandler = asyncHandler(async (req: Request, res: Response) => {
  await deleteProject(user(req), parseId(req));
  res.json({ ok: true });
});

const siteSchema = z.object({
  siteNotes: z
    .string()
    .trim()
    .max(5000)
    .nullish()
    .transform((v) => (v === undefined ? undefined : v || null)),
  actualStartDate: date.optional(),
  actualCompletionDate: date.optional(),
  stage: z
    .enum(["in_progress", "completed"])
    .nullish()
    .transform((v) => v ?? null),
  componentProgressPct: pct.optional(),
  physicalProgressPct: pct.optional(),
});
export const updateSiteHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = parse(siteSchema, req.body);
  // Keys not sent stay as they are.
  const input = {
    siteNotes: "siteNotes" in req.body ? body.siteNotes : undefined,
    actualStartDate: "actualStartDate" in req.body ? body.actualStartDate : undefined,
    actualCompletionDate: "actualCompletionDate" in req.body ? body.actualCompletionDate : undefined,
    componentProgressPct: "componentProgressPct" in req.body ? body.componentProgressPct : undefined,
    physicalProgressPct: "physicalProgressPct" in req.body ? body.physicalProgressPct : undefined,
    stage: body.stage,
  };
  res.json({ project: await updateSite(user(req), parseId(req), input) });
});

const gpsSchema = z.object({
  point: z.enum(["start", "end"]),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});
export const markGpsHandler = asyncHandler(async (req: Request, res: Response) => {
  const b = parse(gpsSchema, req.body);
  if (b.lat === 0 && b.lng === 0) throw ApiError.badRequest("The location was not read - try again.");
  res.json({ project: await markGps(user(req), parseId(req), b.point, b.lat, b.lng) });
});

const fileSchema = z.object({ base64: z.string().min(1, "No file."), mimeType: z.string().min(1), fileName: text });
export const addDocumentHandler = asyncHandler(async (req: Request, res: Response) => {
  const b = parse(z.object({ kind: z.enum(["estimate", "boq", "other"]), file: fileSchema }), req.body);
  res.status(201).json({ document: await addDocument(user(req), parseId(req), b.kind, b.file) });
});

const coord = (min: number, max: number) =>
  z.coerce
    .number()
    .min(min)
    .max(max)
    .nullish()
    .transform((v) => v ?? null);
export const addPhotoHandler = asyncHandler(async (req: Request, res: Response) => {
  const b = parse(
    z.object({ milestone: z.enum(PROJECT_MILESTONES), photo: fileSchema, lat: coord(-90, 90), lng: coord(-180, 180) }),
    req.body,
  );
  res.status(201).json({ photo: await addPhoto(user(req), parseId(req), b.milestone, b.photo, b.lat, b.lng) });
});

export const removePhotoHandler = asyncHandler(async (req: Request, res: Response) => {
  await removeFile(user(req), "project_photos", parseId(req));
  res.json({ ok: true });
});
export const removeDocumentHandler = asyncHandler(async (req: Request, res: Response) => {
  await removeFile(user(req), "project_documents", parseId(req));
  res.json({ ok: true });
});

export const getPhotoHandler = asyncHandler(async (req: Request, res: Response) => {
  const f = await filePath(user(req), "project_photos", parseId(req));
  if (!fs.existsSync(f.path)) throw ApiError.notFound("Photo file is missing from storage.");
  res.sendFile(f.path);
});
export const getDocumentHandler = asyncHandler(async (req: Request, res: Response) => {
  const f = await filePath(user(req), "project_documents", parseId(req));
  if (!fs.existsSync(f.path)) throw ApiError.notFound("File is missing from storage.");
  if (f.mime) res.type(f.mime);
  if (f.name) res.setHeader("Content-Disposition", `inline; filename="${f.name.replace(/[^\w.\- ]+/g, "_")}"`);
  res.sendFile(f.path);
});

export const engineerSetupHandler = asyncHandler(async (_req: Request, res: Response) => {
  res.json(await engineerSetup());
});

export const assignWardsHandler = asyncHandler(async (req: Request, res: Response) => {
  const b = parse(
    z.object({
      role: z.enum(ENGINEER_ROLES),
      wardIds: z.array(z.coerce.number().int().positive()).min(1, "Select at least one ward."),
      userId: z.coerce.number().int().positive().nullable(),
    }),
    req.body,
  );
  res.json(await assignWards(user(req), b.role, b.wardIds, b.userId));
});

const pick = z.coerce.number().int().positive().nullable().optional();
export const setMonitorsHandler = asyncHandler(async (req: Request, res: Response) => {
  const b = parse(z.object({ je_civil: pick, je_mechanical: pick, ae_civil: pick, ae_mechanical: pick }), req.body);
  res.json({ project: await setMonitors(user(req), parseId(req), b) });
});

export const auditTrailHandler = asyncHandler(async (req: Request, res: Response) => {
  const q = parse(
    z.object({
      projectId: z.coerce.number().int().positive().optional(),
      from: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      to: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      limit: z.coerce.number().int().min(1).max(5000).default(1000),
    }),
    Object.fromEntries(Object.entries(req.query).filter(([, v]) => v !== "")),
  );
  res.json({ events: await auditTrail({ projectId: q.projectId ?? null, from: q.from ?? null, to: q.to ?? null, limit: q.limit }) });
});

export const bulkImportHandler = asyncHandler(async (req: Request, res: Response) => {
  const b = parse(z.object({ base64: z.string().min(1, "No file.") }), req.body);
  const buffer = Buffer.from(b.base64, "base64");
  if (buffer.length > 7 * 1024 * 1024) throw ApiError.badRequest("The file is too large - at most 7 MB.");
  try {
    res.json(await importProjects(user(req), buffer));
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw ApiError.badRequest(e instanceof Error ? e.message : "Could not read the file.");
  }
});

export const templateHandler = asyncHandler(async (_req: Request, res: Response) => {
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="project-upload-template.xlsx"');
  res.send(await projectTemplate());
});

/** The list (same filters) in the 3 Years Report format. */
export const exportReportHandler = asyncHandler(async (req: Request, res: Response) => {
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="projects-3-years-report-format.xlsx"');
  res.send(await exportProjectsReport(user(req), filter(req)));
});
