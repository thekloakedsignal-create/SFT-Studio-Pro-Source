import crypto from "crypto";
import fs from "fs";
import path from "path";
import { db, sessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Request, Response } from "express";
import * as client from "openid-client";

export const ISSUER_URL = process.env.ISSUER_URL ?? "https://replit.com/oidc";
export const SESSION_COOKIE = "sid";
export const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;

// Same shape the routes already read from req.user (uid, email, email_verified).
export interface AppUser {
  uid: string;
  email: string | null;
  email_verified: boolean;
  displayName: string | null;
  photoURL: string | null;
}

let oidcConfig: client.Configuration | null = null;
export async function getOidcConfig(): Promise<client.Configuration> {
  if (!oidcConfig) oidcConfig = await client.discovery(new URL(ISSUER_URL), process.env.REPL_ID!);
  return oidcConfig;
}

// Keep existing data attached: reuse the account ID already on file for this email.
function existingUidForEmail(email: string | null): string | null {
  if (!email) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), ".data", "users.json"), "utf8"));
    const list: any[] = Array.isArray(raw) ? raw : Object.values(raw || {});
    const match = list.find(u => typeof u?.email === "string" && u.email.toLowerCase() === email.toLowerCase());
    const uid = match?.uid || match?.userId || match?.id;
    return typeof uid === "string" && uid ? uid : null;
  } catch {
    return null;
  }
}

// The owner's Replit login email maps to the owner's existing account.
const EMAIL_ALIASES: Record<string, string> = { "dubsteph47@gmail.com": "thekloakedsignal@gmail.com" };

// This is the existing owner account used by the saved projects and owner profile.
// Never let an ephemeral users.json file change its identity between sign-ins.
function stableAccountIdentity(user: AppUser): AppUser {
  if (!user.email_verified || !user.email) return user;
  const email = EMAIL_ALIASES[user.email.toLowerCase()] || user.email.toLowerCase();
  return email === "thekloakedsignal@gmail.com"
    ? { ...user, uid: "izaaUGzC28eM6FJcisbfKhGrwaF3", email }
    : user;
}

export function userFromClaims(claims: Record<string, unknown>): AppUser {
  const rawEmail = typeof claims.email === "string" ? claims.email : null;
  const email = rawEmail ? EMAIL_ALIASES[rawEmail.toLowerCase()] || rawEmail : null;
  const name = [claims.first_name, claims.last_name].filter(v => typeof v === "string" && v).join(" ");
  return stableAccountIdentity({
    uid: existingUidForEmail(email) || String(claims.sub),
    email,
    email_verified: Boolean(email) && claims.email_verified !== false,
    displayName: name || null,
    photoURL: (claims.profile_image_url || claims.picture || null) as string | null,
  });
}

export async function createSession(user: AppUser): Promise<string> {
  const sid = crypto.randomBytes(32).toString("hex");
  await db.insert(sessionsTable).values({ sid, sess: { user }, expire: new Date(Date.now() + SESSION_TTL) });
  return sid;
}

export async function getSessionUser(req: Request): Promise<AppUser | null> {
  const sid = req.cookies?.[SESSION_COOKIE];
  if (!sid) return null;
  const [row] = await db.select().from(sessionsTable).where(eq(sessionsTable.sid, sid));
  if (!row || row.expire < new Date()) {
    if (row) await db.delete(sessionsTable).where(eq(sessionsTable.sid, sid));
    return null;
  }
  const user = (row.sess as any)?.user as AppUser | undefined;
  if (!user) return null;
  const resolvedUser = stableAccountIdentity(user);
  if (resolvedUser.uid !== user.uid || resolvedUser.email !== user.email) {
    await db.update(sessionsTable)
      .set({ sess: { ...(row.sess as any), user: resolvedUser } })
      .where(eq(sessionsTable.sid, sid));
  }
  return resolvedUser;
}

export async function clearSession(req: Request, res: Response): Promise<void> {
  const sid = req.cookies?.[SESSION_COOKIE];
  if (sid) await db.delete(sessionsTable).where(eq(sessionsTable.sid, sid));
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}
