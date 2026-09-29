import { Router } from "express";
import { postForgotPassword, postResetPassword } from "../controllers/passwordReset.controller";
import { loginRateLimiter } from "../middleware/loginRateLimiter";
import { postTcLogin } from "../controllers/taxCollectorAuth.controller";

export const tcAuthRouter = Router();

tcAuthRouter.post("/login", loginRateLimiter, postTcLogin);
tcAuthRouter.post("/forgot-password", loginRateLimiter, postForgotPassword("admin"));
tcAuthRouter.post("/reset-password", loginRateLimiter, postResetPassword("admin"));