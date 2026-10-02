import type { Request } from "express";
import rateLimit from "express-rate-limit";

/**
 * The general API-wide rate limiter in app.ts is far too loose to
 * meaningfully slow down a password-guessing attempt against a login
 * endpoint specifically (it's sized for normal API traffic across every
 * route). This is a second, much tighter limiter applied ONLY to login
 * routes: 5 attempts per 15 minutes. A legitimate user mistyping
 * their password a couple of times is unaffected; a scripted brute-force
 * attempt is not.
 *
 * Keyed by IP + the account identifier being attempted (username, or
 * email for forgot/reset-password), NOT by IP alone. Reported bug: field
 * staff (e.g. jamadars) logging in around shift start (6am) from mobile
 * data would sometimes all get "Too many login attempts" together, even
 * with correct passwords. Indian mobile carriers commonly put many
 * unrelated phones behind one shared public IP (carrier-grade NAT) - a
 * few of them mistyping a password within the same 15-minute window was
 * enough to exhaust the whole shared IP's budget and lock out everyone
 * else on that carrier, not just the people who got it wrong. Keying by
 * IP+account keeps the same 5-attempts-per-15-minutes cap against any
 * ONE account being guessed (from one IP or many), without one
 * account's mistakes spending a budget that unrelated accounts on the
 * same network depend on.
 */
function loginRateLimitKey(request: Request): string {
  const body = request.body as Record<string, unknown> | undefined;
  const identifier =
    (typeof body?.username === "string" && body.username.trim().toLowerCase()) ||
    (typeof body?.email === "string" && body.email.trim().toLowerCase()) ||
    (typeof body?.token === "string" && body.token) ||
    null;
  return identifier ? `${request.ip}:${identifier}` : String(request.ip);
}

export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please wait 15 minutes before trying again." },
  keyGenerator: loginRateLimitKey,
  // Only count FAILED attempts against the limit — a person who gets
  // their password right on the 3rd try shouldn't have that success
  // itself count toward locking them out of a legitimate next login
  // later the same day.
  skipSuccessfulRequests: true,
});