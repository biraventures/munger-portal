import type { Request, Response } from "express";
import { z } from "zod";
import { geoRepository } from "../repositories/geo.repository";
import { buildGeoJson, buildKml, buildGeoXlsx, type GeoExportFormat, type GeoExportDataset } from "../services/geoExport.service";
import { parseKmlPlacemarks } from "../services/kmlImport.service";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

const pointSchema = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });

const setGeoSchema = z.object({
  geometryType: z.enum(["point", "polygon"]),
  coordinates: z.union([
    pointSchema,
    z.array(pointSchema).min(3, "A polygon needs at least 3 points").max(15, "A holding polygon can have at most 15 points"),
  ]),
});

/** GET /api/v1/admin/geo/properties/search?q=... - search holdings by number or owner name, for the ATPS to find the holding they're standing at. */
export const searchPropertiesForGeo = asyncHandler(async (req: Request, res: Response) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!q) return res.status(200).json({ properties: [] });
  const properties = await geoRepository.searchProperties(q);
  res.status(200).json({ properties });
});

/** GET /api/v1/admin/geo/properties/all - every holding with geometry assigned, for the GIS map showing everything at once. */
export const listAllPropertyGeoHandler = asyncHandler(async (_req: Request, res: Response) => {
  const properties = await geoRepository.listAllPropertyGeo();
  res.status(200).json({ properties });
});

const holdingNoParamSchema = z.object({ holdingNo: z.string().trim().min(1) });

/** GET /api/v1/admin/geo/properties/:holdingNo - a holding's current geometry, plus its area (to suggest point vs. polygon against the point/polygon threshold). */
export const getPropertyGeo = asyncHandler(async (req: Request, res: Response) => {
  const parsed = holdingNoParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid holding number");
  const property = await geoRepository.findPropertyGeo(parsed.data.holdingNo);
  if (!property) throw ApiError.notFound("Holding not found");
  res.status(200).json({ property });
});

/** PUT /api/v1/admin/geo/properties/:holdingNo - set or update a holding's geometry. The point/polygon threshold is suggested client-side only; either type is accepted here, since an irregular small plot may legitimately need a polygon and vice versa. */
export const putPropertyGeo = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = holdingNoParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid holding number");
  const bodyParsed = setGeoSchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid coordinates", bodyParsed.error.flatten().fieldErrors);

  const existing = await geoRepository.findPropertyGeo(paramsParsed.data.holdingNo);
  if (!existing) throw ApiError.notFound("Holding not found");

  const updated = await geoRepository.setPropertyGeo(
    paramsParsed.data.holdingNo,
    bodyParsed.data.geometryType,
    bodyParsed.data.coordinates,
    req.admin!.displayName,
  );
  res.status(200).json({ property: updated });
});

/** GET /api/v1/admin/geo/progress - how many holdings have geometry assigned vs. the total, for a simple progress indicator. */
export const getGeoProgress = asyncHandler(async (_req: Request, res: Response) => {
  const progress = await geoRepository.countPropertyGeoProgress();
  res.status(200).json(progress);
});

// --- Infrastructure lines ---

const lineTypeQuerySchema = z.object({ type: z.enum(["road", "drain", "canal"]).optional() });

export const listInfrastructureLinesHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = lineTypeQuerySchema.safeParse(req.query);
  const lines = await geoRepository.listInfrastructureLines(parsed.success ? parsed.data.type : undefined);
  res.status(200).json({ lines });
});

const createLineSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  lineType: z.enum(["road", "drain", "canal"]),
  coordinates: z.array(pointSchema).min(2, "A line needs at least 2 points"),
});

export const createInfrastructureLineHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = createLineSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Invalid input", parsed.error.flatten().fieldErrors);
  const line = await geoRepository.createInfrastructureLine({ ...parsed.data, createdBy: req.admin!.displayName });
  res.status(200).json({ line });
});

const lineIdParamSchema = z.object({ id: z.coerce.number().int().positive() });
const updateLineSchema = z.object({
  name: z.string().trim().min(1).optional(),
  lineType: z.enum(["road", "drain", "canal"]).optional(),
  coordinates: z.array(pointSchema).min(2).optional(),
});

export const updateInfrastructureLineHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = lineIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid line id");
  const bodyParsed = updateLineSchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input", bodyParsed.error.flatten().fieldErrors);
  const line = await geoRepository.updateInfrastructureLine(paramsParsed.data.id, bodyParsed.data, req.admin!.displayName);
  if (!line) throw ApiError.notFound("Line not found");
  res.status(200).json({ line });
});

export const deleteInfrastructureLineHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = lineIdParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid line id");
  const deleted = await geoRepository.deleteInfrastructureLine(parsed.data.id);
  if (!deleted) throw ApiError.notFound("Line not found");
  res.status(200).json({ deleted: true });
});

// --- Export ---

const exportQuerySchema = z.object({
  format: z.enum(["geojson", "kml", "xlsx"]),
  dataset: z.enum(["properties", "infrastructure", "all"]).default("all"),
});

/** GET /api/v1/admin/geo/export?format=geojson|kml|xlsx&dataset=properties|infrastructure|all */
export const exportGeoData = asyncHandler(async (req: Request, res: Response) => {
  const parsed = exportQuerySchema.safeParse(req.query);
  if (!parsed.success) throw ApiError.badRequest("Invalid export parameters", parsed.error.flatten().fieldErrors);
  const { format, dataset } = parsed.data as { format: GeoExportFormat; dataset: GeoExportDataset };

  if (format === "geojson") {
    const geojson = await buildGeoJson(dataset);
    res.setHeader("Content-Type", "application/geo+json");
    res.setHeader("Content-Disposition", `attachment; filename="nnm-geo-${dataset}.geojson"`);
    res.status(200).send(JSON.stringify(geojson, null, 2));
    return;
  }
  if (format === "kml") {
    const kml = await buildKml(dataset);
    res.setHeader("Content-Type", "application/vnd.google-earth.kml+xml");
    res.setHeader("Content-Disposition", `attachment; filename="nnm-geo-${dataset}.kml"`);
    res.status(200).send(kml);
    return;
  }
  const buffer = await buildGeoXlsx(dataset);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="nnm-geo-${dataset}.xlsx"`);
  res.status(200).send(Buffer.from(buffer));
});

// --- KML import ---

const importInfrastructureKmlSchema = z.object({
  kmlContent: z.string().min(1, "The KML file appears to be empty"),
  fileName: z.string().trim().min(1),
  lineType: z.enum(["road", "drain", "canal"]),
  roadCategory: z.enum(["PMR", "MR", "OR"]).nullable().optional(),
});

/** POST /api/v1/admin/geo/infrastructure-lines/import-kml - every LineString Placemark in the file becomes its own infrastructure line, sharing the line type/road category/source file name given here. Polygon Placemarks in the same file (if any) are skipped, since a road/drain/canal is a path, not an area - upload those separately as ward boundaries or via the holding-polygon flow instead. */
export const importInfrastructureLinesKmlHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = importInfrastructureKmlSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Invalid input", parsed.error.flatten().fieldErrors);
  if (parsed.data.lineType !== "road" && parsed.data.roadCategory) {
    throw ApiError.badRequest("A road category only applies when the line type is road");
  }

  const placemarks = parseKmlPlacemarks(parsed.data.kmlContent).filter((p) => p.geometryType === "linestring");
  if (placemarks.length === 0) throw ApiError.badRequest("No line shapes were found in this KML file.");

  const lines = await geoRepository.bulkCreateInfrastructureLines(
    placemarks.map((p) => ({ name: p.name, coordinates: p.coordinates })),
    {
      lineType: parsed.data.lineType,
      roadCategory: parsed.data.lineType === "road" ? (parsed.data.roadCategory ?? null) : null,
      sourceFileName: parsed.data.fileName,
      createdBy: req.admin!.displayName,
    },
  );
  res.status(200).json({ imported: lines.length, lines });
});

const importWardKmlSchema = z.object({
  kmlContent: z.string().min(1, "The KML file appears to be empty"),
  fileName: z.string().trim().min(1),
});

/** POST /api/v1/admin/geo/ward-boundaries/import-kml - every Polygon Placemark becomes a ward boundary, with the Placemark's name used as the ward number. Re-importing a ward number already on file replaces that ward's boundary rather than duplicating it. */
export const importWardBoundariesKmlHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = importWardKmlSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Invalid input", parsed.error.flatten().fieldErrors);

  const placemarks = parseKmlPlacemarks(parsed.data.kmlContent).filter((p) => p.geometryType === "polygon");
  if (placemarks.length === 0) throw ApiError.badRequest("No ward boundary polygons were found in this KML file.");

  const wards = await geoRepository.bulkCreateWardBoundaries(
    placemarks.map((p) => ({ name: p.name, coordinates: p.coordinates })),
    { sourceFileName: parsed.data.fileName, createdBy: req.admin!.displayName },
  );
  res.status(200).json({ imported: wards.length, wards });
});

export const listWardBoundariesHandler = asyncHandler(async (_req: Request, res: Response) => {
  const wards = await geoRepository.listWardBoundaries();
  res.status(200).json({ wards });
});

export const deleteWardBoundaryHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = lineIdParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid ward boundary id");
  const deleted = await geoRepository.deleteWardBoundary(parsed.data.id);
  if (!deleted) throw ApiError.notFound("Ward boundary not found");
  res.status(200).json({ deleted: true });
});
