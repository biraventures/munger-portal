import { Router } from "express";
import { postAdminLogin } from "../controllers/adminAuth.controller";
import { postForgotPassword, postResetPassword } from "../controllers/passwordReset.controller";
import { loginRateLimiter } from "../middleware/loginRateLimiter";

export const tcAuthRouter = Router();

tcAuthRouter.post("/login", loginRateLimiter, postAdminLogin);
tcAuthRouter.post("/forgot-password", loginRateLimiter, postForgotPassword("admin"));
tcAuthRouter.post("/reset-password", loginRateLimiter, postResetPassword("admin"));