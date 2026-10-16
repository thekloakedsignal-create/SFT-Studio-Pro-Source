import { Request, Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { resolveClerkAccount, type AppUser } from "../lib/clerk-account.ts";
import { logger } from "../lib/logger.ts";

export interface AuthRequest extends Request {
  user?: AppUser;
  deviceId?: string;
}

export const optionalAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const headerDeviceId = req.headers["x-device-id"];
  if (typeof headerDeviceId === "string") {
    req.deviceId = headerDeviceId;
  }

  try {
    if (req.user) return next();
    const auth = getAuth(req);
    if (auth.userId) {
      req.user = await resolveClerkAccount(auth.sessionClaims as unknown as Record<string, unknown>);
    }
  } catch (error) {
    logger.warn({ error: String(error) }, "Account bridge unavailable");
    res.status(503).json({ success: false, error: "Your account could not be loaded. Please retry." });
    return;
  }
  next();
};

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  await optionalAuth(req, res, () => {
    if (!req.user) {
      res.status(401).json({ success: false, error: "Please sign in." });
      return;
    }
    next();
  });
};
