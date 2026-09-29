import type { Request, Response } from "express";
import { z } from "zod";
import { tcLogin } from "../services/taxCollectorAuth.service";
import { asyncHandler } from "../../middleware/asyncHandler";
import { ApiError } from "../../utils/ApiError";

const loginSchema = z.object({
  username: z.string().trim().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export const postTcLogin = asyncHandler(async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    throw ApiError.badRequest(
      "Invalid login request",
      parsed.error.flatten().fieldErrors,
    );
  }

  const result = await tcLogin(parsed.data.username.toUpperCase(), parsed.data.password);
  res.status(200).json(result);
});
