import { Request, Response, NextFunction } from "express";
import { getSessionUser, type AppUser } from "../lib/replit-auth.ts";

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
    const user = await getSessionUser(req);
    if (user) req.user = user;
  } catch (error) {
    console.warn("Optional auth session notice:", error);
  }
  next();
};
