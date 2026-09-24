import { Router } from "express";
import { postLogin } from "../controllers/auth.controller";
import { postForgotPassword, postResetPassword } from "../controllers/passwordReset.controller";
import { loginRateLimiter } from "../middleware/loginRateLimiter";

export const authRouter = Router();

// POST /api/v1/auth/login
authRouter.post("/login", loginRateLimiter, postLogin);

// POST /api/v1/auth/forgot-password and /api/v1/auth/reset-password —
// same rate limiter as login, since both are just as abusable (email
// spam / brute-forcing a reset token) as password guessing itself.
authRouter.post("/forgot-password", loginRateLimiter, postForgotPassword("operator"));
authRouter.post("/reset-password", loginRateLimiter, postResetPassword("operator"));