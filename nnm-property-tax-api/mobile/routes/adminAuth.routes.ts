import { Router } from "express";
import { postAdminLogin } from "../controllers/adminAuth.controller";
import { postForgotPassword, postResetPassword } from "../controllers/passwordReset.controller";
import { loginRateLimiter } from "../middleware/loginRateLimiter";

export const adminAuthRouter = Router();

// POST /api/v1/admin/auth/login
adminAuthRouter.post("/login", loginRateLimiter, postAdminLogin);

// POST /api/v1/admin/auth/forgot-password and /api/v1/admin/auth/reset-password
adminAuthRouter.post("/forgot-password", loginRateLimiter, postForgotPassword("admin"));
adminAuthRouter.post("/reset-password", loginRateLimiter, postResetPassword("admin"));