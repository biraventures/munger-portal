import nodemailer from "nodemailer";
import { env } from "../config/env";

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_PORT === 465,
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASSWORD,
  },
});

/**
 * Thin wrapper so callers never touch nodemailer directly - if the
 * email provider ever changes, only this file needs to change.
 */
async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  await transporter.sendMail({
    from: `"Munger Nagar Nigam" <${env.SMTP_USER}>`,
    to,
    subject,
    html,
  });
}

export async function sendPasswordResetEmail(
  to: string,
  displayName: string,
  accountType: "admin" | "operator",
  resetLink: string,
): Promise<void> {
  const roleLabel = accountType === "admin" ? "Admin" : "Operator";
  await sendEmail(
    to,
    "Munger Nagar Nigam - Password Reset Request",
    `
      <p>Hi ${displayName},</p>
      <p>A password reset was requested for your NNM ${roleLabel} account. Click the link below to set a new password:</p>
      <p><a href="${resetLink}">${resetLink}</a></p>
      <p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email - your password won't be changed.</p>
      <p>- Munger Nagar Nigam</p>
    `,
  );
}