import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  PGPOOL_MAX: z.coerce.number().default(10),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().default(120),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  VERIFICATION_SECRET: z.string().min(16, "VERIFICATION_SECRET must be at least 16 characters — used to sign document verification QR codes"),
  JWT_EXPIRES_IN: z.string().default("8h"),
  FRONTEND_URL: z.string().url().default("http://localhost:3000"),
  FRONTEND_BASE_PATH: z.string().default(""),
  ICICI_MERCHANT_ID: z.string().default(""),
  ICICI_AGG_ID: z.string().default(""),
  ICICI_SECRET_KEY: z.string().default(""),
  ICICI_RETURN_URL: z.string().default(""),
  // Kill switch for the citizen-facing online payment gateway - default
  // false. Set to "true" once the ICICI integration is properly signed
  // and live on whichever server actually hosts this (see the warning
  // in onlinePayment.service.ts about the placeholder redirect). Kept
  // separate from ICICI_MERCHANT_ID so the merchant ID can stay
  // configured without the button being live.
  // Only the words true/1/yes switch it on. (z.coerce.boolean() would treat the text "false" as true.)
  ONLINE_PAYMENT_ENABLED: z.preprocess((v) => (typeof v === "string" ? ["true", "1", "yes"].includes(v.trim().toLowerCase()) : v), z.boolean().default(false)),
  SMTP_HOST: z.string().default("smtp.gmail.com"),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().min(1, "SMTP_USER is required to send password reset emails"),
  SMTP_PASSWORD: z.string().min(1, "SMTP_PASSWORD is required to send password reset emails"),
  // Where daily attendance group photos are written. Defaults to a local
  // folder for development; in production point this at the SDC's NFS
  // mount (e.g. /image-upload) so photos survive an App server redeploy.
  PHOTO_UPLOAD_DIR: z.string().default("./uploads/attendance-photos"),

});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Fail fast and loud — a misconfigured tax system should never start
  // half-working.
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGINS.split(",").map((o) => o.trim()),
  isProduction: parsed.data.NODE_ENV === "production",
};