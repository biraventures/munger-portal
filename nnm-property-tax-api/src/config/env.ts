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
  // Bank return URL for building permit fee payments. Empty = derived from ICICI_RETURN_URL
  // (.../properties/pay/online/callback -> .../public/building-permit/pay/callback). Must be registered with ICICI too.
  ICICI_BP_RETURN_URL: z.string().default(""),
  // Gateway endpoints. Default to ICICI's UAT (test) servers; production values go in the server .env:
  //   ICICI_PG_INITIATE_URL=https://pgpay.icicibank.com/pg/api/v2/initiateSale
  //   ICICI_PG_COMMAND_URL=https://pgpay.icicibank.com/pg/api/command
  ICICI_PG_INITIATE_URL: z.string().url().default("https://pgpayuat.icici.bank.in/tsp/pg/api/v2/initiateSale"),
  ICICI_PG_COMMAND_URL: z.string().url().default("https://pgpayuat.icici.bank.in/tsp/pg/api/command"),
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
  // Face-verified attendance (CompreFace, self-hosted on the APP server). Off until CompreFace is installed.
  FACE_ATTENDANCE_ENABLED: z.preprocess((v) => (typeof v === "string" ? ["true", "1", "yes"].includes(v.trim().toLowerCase()) : v), z.boolean().default(false)),
  COMPREFACE_URL: z.string().default("http://127.0.0.1:8000"),
  // API key of the CompreFace *Recognition* service (CompreFace web UI > application > service). Server .env only.
  COMPREFACE_API_KEY: z.string().default(""),
  // Similarity (0-1) needed for the straight-on photo, and for the head-turned photo (a turned face matches less).
  FACE_MATCH_THRESHOLD: z.coerce.number().min(0).max(1).default(0.85),
  FACE_MATCH_THRESHOLD_TURNED: z.coerce.number().min(0).max(1).default(0.75),
  // Liveness: straight photo must be within this many degrees of straight; the turn must move the head at least this much.
  FACE_FRONT_MAX_YAW: z.coerce.number().default(15),
  FACE_TURN_MIN_YAW: z.coerce.number().default(20),
  // Which sign of CompreFace's yaw means "worker turned to their LEFT" in a rear-camera photo: 1 or -1.
  // 0 = check only that the head turned (either way) - use until calibrated (see FACE_ATTENDANCE_SETUP.md).
  FACE_YAW_SIGN: z.coerce.number().int().min(-1).max(1).default(0),
  // Punch photos are deleted after this many days (the attendance record and match scores stay).
  FACE_PHOTO_RETENTION_DAYS: z.coerce.number().int().min(7).default(90),

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