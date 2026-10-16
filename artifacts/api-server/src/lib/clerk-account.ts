import { trainingPool } from "./training-records.mjs";

// Preserve the existing application UID and owner alias, not Clerk's native ID.
export const OWNER_UID = "izaaUGzC28eM6FJcisbfKhGrwaF3";
const OWNER_EMAIL = "thekloakedsignal@gmail.com";
export const TARGET_EMAIL = "dubsteph47@gmail.com";

export interface AppUser {
  uid: string;
  email: string | null;
  identityEmail: string | null;
  email_verified: boolean;
  displayName: string | null;
  photoURL: string | null;
}

export async function resolveClerkAccount(claims: Record<string, unknown>): Promise<AppUser> {
  const subject = typeof claims.userId === "string" ? claims.userId : null;
  if (!subject) throw new Error("The signed-in session is missing its application identity.");
  const identityEmail = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : null;
  const verified = claims.email_verified === true || claims.emailVerified === true;
  const pool = trainingPool();
  // Session tokens may omit the email claim; fall back to the email already bridged to this account.
  const bridged = await pool.query("SELECT uid, email FROM users WHERE uid = $1", [subject]);
  const bridgedEmail = typeof bridged.rows[0]?.email === "string" ? bridged.rows[0].email.trim().toLowerCase() : null;
  const knownEmail = identityEmail ?? bridgedEmail;
  const isOwner = (verified || bridged.rowCount > 0) && (knownEmail === TARGET_EMAIL || knownEmail === OWNER_EMAIL);
  const email = isOwner ? OWNER_EMAIL : identityEmail;
  let uid = isOwner ? OWNER_UID : subject;
  let existing = bridged.rowCount ? bridged : await pool.query("SELECT uid FROM users WHERE uid = $1", [uid]);
  // Existing accounts were bridged by email; preserve that lookup for migrated users.
  if (!existing.rowCount && verified && email && !isOwner) {
    existing = await pool.query("SELECT uid FROM users WHERE lower(email) = $1 LIMIT 2", [email]);
    if (existing.rows.length > 1) throw new Error("Multiple local accounts match this identity.");
    if (existing.rows[0]) uid = existing.rows[0].uid;
  }
  // Identity columns remain untouched. Roles, quotas and relationships stay local.
  await pool.query(
    `INSERT INTO users (uid, subscription_status, "limit") VALUES ($1, $2, $3)
     ON CONFLICT (uid) DO NOTHING`,
    [uid, isOwner ? "Owner" : "Free", isOwner ? 999999999 : 5000],
  );
  return {
    // Bridged accounts were verified when first linked; the session token may omit the claim.
    uid, email, identityEmail, email_verified: verified || isOwner,
    displayName: [claims.firstName, claims.lastName].filter(v => typeof v === "string" && v).join(" ") || null,
    photoURL: null,
  };
}
