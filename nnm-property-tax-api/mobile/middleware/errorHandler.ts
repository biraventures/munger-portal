import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/ApiError";
import { env } from "../config/env";

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: "Not found" });
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({ error: err.message, details: err.details });
    return;
  }

  // PostgreSQL unique constraint violation (code 23505) - a safety
  // net underneath the application-level duplicate checks (e.g.
  // holding_no's own primary key, or the old_holding_no/old_pid
  // partial unique indexes), in case two requests race each other
  // and both pass the earlier check before either one commits. Turns
  // what would otherwise be an opaque 500 into a clear, actionable message.
  if (typeof err === "object" && err !== null && "code" in err && (err as { code: unknown }).code === "23505") {
    res.status(400).json({ error: "This value is already in use by another record - please check for a duplicate and try again." });
    return;
  }

  req.log?.error(err);
  console.error(err);
  res.status(500).json({
    error: "Internal server error",
    // Never leak stack traces / DB errors to the client in production.
    ...(env.isProduction ? {} : { debug: String(err) }),
  });
}