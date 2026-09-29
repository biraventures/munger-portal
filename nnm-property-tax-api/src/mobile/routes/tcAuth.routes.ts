import { Router } from "express";
import { loginRateLimiter } from "../../middleware/loginRateLimiter";
import { postTcLogin } from "../controllers/taxCollectorAuth.controller";

export const tcAuthRouter = Router();

tcAuthRouter.post("/login", loginRateLimiter, postTcLogin);
