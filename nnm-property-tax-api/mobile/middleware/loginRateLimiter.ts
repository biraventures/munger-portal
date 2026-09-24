import rateLimit from "express-rate-limit";

/**
 * The general API-wide rate limiter in app.ts is far too loose to
 * meaningfully slow down a password-guessing attempt against a login
 * endpoint specifically (it's sized for normal API traffic across every
 * route). This is a second, much tighter limiter applied ONLY to login
 * routes: 5 attempts per 15 minutes per IP. A legitimate user mistyping
 * their password a couple of times is unaffected; a scripted brute-force
 * attempt is not.
 */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please wait 15 minutes before trying again." },
  // Only count FAILED attempts against the limit — a person who gets
  // their password right on the 3rd try shouldn't have that success
  // itself count toward locking them out of a legitimate next login
  // later the same day.
  skipSuccessfulRequests: true,
});