import { COOKIE_NAME, ONE_YEAR_MS } from "../../shared/const.js"; 
import type { Express, Request, Response } from "express";
import { getUserByOpenId, saveGoogleConnection, upsertUser } from "../db";
import { getSessionCookieOptions } from "./cookies";

const OAUTH_STATE_COOKIE = "stealth_oauth_state";
const OAUTH_STATE_MAX_AGE = 10 * 60 * 1000;
import {
  authenticateRequest,
  buildGoogleLoginUrl,
  createSession,
  encodeUserForRedirect,
  getGoogleIdentity,
  upsertGoogleUser,
  verifyLoginState,
} from "./independent-auth";
import { encryptSecret, exchangeGoogleCode, getGmailProfile, verifyGoogleState } from "./google-oauth";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

function getCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  const prefix = `${name}=`;
  const entry = header.split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix));
  return entry ? decodeURIComponent(entry.slice(prefix.length)) : undefined;
}

function buildUserResponse(user: any) {
  return {
    id: user?.id ?? null,
    openId: user?.openId ?? null,
    name: user?.name ?? null,
    email: user?.email ?? null,
    loginMethod: user?.loginMethod ?? null,
    lastSignedIn: (user?.lastSignedIn ?? new Date()).toISOString(),
  };
}

function redirectWithParams(uri: string, params: Record<string, string>) {
  const url = new URL(uri);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

export function registerOAuthRoutes(app: Express) {
  // Independent app sign-in. Google redirects to the backend, which returns a
  // short-lived mobile session to the app's registered deep-link URI.
  app.get("/api/auth/google/start", async (req: Request, res: Response) => {
    const redirectUri = getQueryParam(req, "redirectUri");
    if (!redirectUri || !redirectUri.startsWith("manusstudio://")) {
      res.status(400).json({ error: "A valid mobile redirect URI is required" });
      return;
    }
    try {
      const state = await buildGoogleLoginUrl(redirectUri);
      const stateValue = new URL(state).searchParams.get("state");
      if (!stateValue) throw new Error("OAuth state was not generated");
      res.cookie(OAUTH_STATE_COOKIE, stateValue, {
        ...getSessionCookieOptions(req),
        maxAge: OAUTH_STATE_MAX_AGE,
      });
      res.redirect(302, state);
    } catch (error) {
      console.error("[Auth] Could not start Google sign-in", error);
      res.status(500).json({ error: "Google sign-in is not configured" });
    }
  });

  app.get("/api/auth/google/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const queryState = getQueryParam(req, "state");
    const cookieState = getCookie(req, OAUTH_STATE_COOKIE);
    const state = queryState || cookieState;
    if (!state) {
      res.status(400).send("OAuth state is required");
      return;
    }
    let redirectUri: string;
    try {
      redirectUri = await verifyLoginState(state);
    } catch {
      if (!cookieState || state === cookieState) {
        res.status(400).send("OAuth state is invalid or expired");
        return;
      }
      try {
        redirectUri = await verifyLoginState(cookieState);
      } catch {
        res.status(400).send("OAuth state is invalid or expired");
        return;
      }
    }
    res.clearCookie(OAUTH_STATE_COOKIE, getSessionCookieOptions(req));
    if (!code) {
      res.redirect(302, redirectWithParams(redirectUri, { error: "Google sign-in was cancelled" }));
      return;
    }
    try {
      const profile = await getGoogleIdentity(code);
      const user = await upsertGoogleUser({ sub: profile.sub!, email: profile.email!, name: profile.name });
      const sessionToken = await createSession(user);
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, redirectWithParams(redirectUri, {
        sessionToken,
        user: encodeUserForRedirect(user),
      }));
    } catch (error) {
      console.error("[Auth] Google sign-in callback failed", error);
      const reason = error instanceof Error ? error.message : "Unknown server error";
      const safeReason = reason
        .replace(/GOOGLE_OAUTH_CLIENT_SECRET=\S+/gi, "GOOGLE_OAUTH_CLIENT_SECRET=[redacted]")
        .replace(/client_secret[=:\s]+\S+/gi, "client_secret=[redacted]");
      res.redirect(302, redirectWithParams(redirectUri, {
        error: `Google sign-in failed: ${safeReason}`,
      }));
    }
  });

  // Connect Gmail/Sheets after the user is authenticated. This remains a
  // protected tRPC procedure; its callback stores encrypted Google tokens.
  app.get("/api/google/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    const error = getQueryParam(req, "error");
    if (error) {
      res.status(400).send("Google authorization was cancelled or denied.");
      return;
    }
    if (!code || !state) {
      res.status(400).send("Google OAuth code and state are required.");
      return;
    }
    try {
      const expectedUserId = verifyGoogleState(state);
      const tokenPayload = await exchangeGoogleCode(code);
      const profile = await getGmailProfile(tokenPayload.access_token!);
      await saveGoogleConnection({
        userId: expectedUserId,
        googleSubject: `email:${profile.emailAddress}`,
        email: profile.emailAddress!,
        displayName: profile.emailAddress,
        scopes: tokenPayload.scope ?? "",
        encryptedAccessToken: encryptSecret(tokenPayload.access_token!),
        encryptedRefreshToken: tokenPayload.refresh_token ? encryptSecret(tokenPayload.refresh_token) : undefined,
        tokenExpiresAt: new Date(Date.now() + (tokenPayload.expires_in ?? 3600) * 1000),
        historyId: profile.historyId,
      });
      const frontend = (process.env.EXPO_WEB_PREVIEW_URL || process.env.EXPO_PACKAGER_PROXY_URL || "http://localhost:8081").replace(/\/$/, "");
      res.redirect(302, `${frontend}/senders?google=connected`);
    } catch (callbackError) {
      console.error("[Google OAuth] Callback failed", callbackError instanceof Error ? callbackError.message : "unknown error");
      res.status(500).send("Google connection could not be completed. Return to Stealth Mail Studio and try again.");
    }
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    res.json({ success: true });
  });
  app.get("/api/auth/me", async (req: Request, res: Response) => {
    try {
      const user = await authenticateRequest(req);
      res.json({ user: buildUserResponse(user) });
    } catch {
      res.status(401).json({ error: "Not authenticated", user: null });
    }
  });
}
