import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";
import type { TCTokenPayload } from "../mobile/types/tcauth.types";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      tc?: TCTokenPayload;
    }
  }
}

export function requireTaxCollector(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    throw new ApiError(401, "Missing or malformed Authorization header");
  }

  const token = header.slice("Bearer ".length);

  try {
    const payload = jwt.verify(
      token,
      env.JWT_SECRET,
    ) as unknown as TCTokenPayload;
    if (payload.type !== "tax_collector") {
      throw new Error("wrong token type");
    }
    req.tc = payload;
    next();
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(401, "Invalid or expired session — please log in again");
  }
}
