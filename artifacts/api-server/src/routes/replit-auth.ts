import { Router, type IRouter, type Request, type Response } from "express";
import * as oidc from "openid-client";
import {
  clearSession, createSession, getOidcConfig, getSessionUser, userFromClaims, SESSION_COOKIE, SESSION_TTL,
} from "../lib/replit-auth.ts";

const router: IRouter = Router();
const cookieOpts = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" };

function getOrigin(req: Request): string {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers["host"] || "localhost";
  return `${proto}://${host}`;
}

function safeReturnTo(value: unknown): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

router.get("/auth/user", async (req: Request, res: Response) => {
  try {
    res.json({ user: await getSessionUser(req) });
  } catch {
    res.json({ user: null });
  }
});

router.get("/login", async (req: Request, res: Response) => {
  const config = await getOidcConfig();
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const redirectTo = oidc.buildAuthorizationUrl(config, {
    redirect_uri: `${getOrigin(req)}/api/callback`,
    scope: "openid email profile offline_access",
    code_challenge: await oidc.calculatePKCECodeChallenge(codeVerifier),
    code_challenge_method: "S256",
    prompt: "login consent",
    state,
    nonce,
  });
  const tmp = { ...cookieOpts, maxAge: 10 * 60 * 1000 };
  res.cookie("code_verifier", codeVerifier, tmp);
  res.cookie("nonce", nonce, tmp);
  res.cookie("state", state, tmp);
  res.cookie("return_to", safeReturnTo(req.query.returnTo), tmp);
  res.redirect(redirectTo.href);
});

router.get("/callback", async (req: Request, res: Response) => {
  const config = await getOidcConfig();
  const callbackUrl = `${getOrigin(req)}/api/callback`;
  const codeVerifier = req.cookies?.code_verifier;
  const expectedState = req.cookies?.state;
  if (!codeVerifier || !expectedState) { res.redirect("/api/login"); return; }

  let tokens: oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers;
  try {
    tokens = await oidc.authorizationCodeGrant(
      config,
      new URL(`${callbackUrl}?${new URL(req.url, `http://${req.headers.host}`).searchParams}`),
      { pkceCodeVerifier: codeVerifier, expectedNonce: req.cookies?.nonce, expectedState, idTokenExpected: true },
    );
  } catch {
    res.redirect("/api/login");
    return;
  }

  const returnTo = safeReturnTo(req.cookies?.return_to);
  for (const name of ["code_verifier", "nonce", "state", "return_to"]) res.clearCookie(name, { path: "/" });

  const claims = tokens.claims();
  if (!claims) { res.redirect("/api/login"); return; }

  const sid = await createSession(userFromClaims(claims as unknown as Record<string, unknown>));
  res.cookie(SESSION_COOKIE, sid, { ...cookieOpts, maxAge: SESSION_TTL });
  res.redirect(returnTo);
});

router.get("/logout", async (req: Request, res: Response) => {
  const config = await getOidcConfig();
  await clearSession(req, res);
  const endSessionUrl = oidc.buildEndSessionUrl(config, {
    client_id: process.env.REPL_ID!,
    post_logout_redirect_uri: new URL(safeReturnTo(req.query.returnTo), `${getOrigin(req)}/`).href,
  });
  res.redirect(endSessionUrl.href);
});

export default router;
