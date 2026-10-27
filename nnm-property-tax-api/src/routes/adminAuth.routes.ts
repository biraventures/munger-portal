import { Router } from "express";
import { postAdminLogin, postChangeOwnPassword } from "../controllers/adminAuth.controller";
import { requireAdmin } from "../middleware/requireAdmin";
import { postForgotPassword, postResetPassword } from "../controllers/passwordReset.controller";
import { loginRateLimiter } from "../middleware/loginRateLimiter";

export const adminAuthRouter = Router();

// POST /api/v1/admin/auth/login
adminAuthRouter.post("/login", loginRateLimiter, postAdminLogin);

// POST /api/v1/admin/auth/forgot-password and /api/v1/admin/auth/reset-password
adminAuthRouter.post("/forgot-password", loginRateLimiter, postForgotPassword("admin"));
adminAuthRouter.post("/reset-password", loginRateLimiter, postResetPassword("admin"));

// POST /api/v1/admin/auth/change-password - signed-in Tax Collector changes own password (old + new + confirm).
// Rate-limited like the login, so the current-password check cannot be used to guess passwords.
adminAuthRouter.post("/change-password", loginRateLimiter, requireAdmin, postChangeOwnPassword);
