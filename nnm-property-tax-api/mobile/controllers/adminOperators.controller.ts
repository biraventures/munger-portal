import type { Request, Response } from "express";
import { z } from "zod";
import { operatorRepository } from "../repositories/operator.repository";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

/** GET /api/v1/admin/operators */
export const listOperators = asyncHandler(async (_req: Request, res: Response) => {
  const operators = await operatorRepository.listAll();
  res.status(200).json({ operators });
});

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });
const activeBodySchema = z.object({ active: z.boolean() });

/** PATCH /api/v1/admin/operators/:id/active */
export const setOperatorActive = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = idParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid operator id");

  const bodyParsed = activeBodySchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Body must include { active: boolean }");

  const updated = await operatorRepository.setActive(paramsParsed.data.id, bodyParsed.data.active);
  if (!updated) throw ApiError.notFound("Operator not found");

  res.status(200).json({ operator: updated });
});