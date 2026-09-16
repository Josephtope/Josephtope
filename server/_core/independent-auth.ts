import crypto from "node:crypto";
import type { Request } from "express";
import { jwtVerify, SignJWT } from "jose";
import { COOKIE_NAME, ONE_YEAR_MS } from "../../shared/const.js";
import { ForbiddenError } from "../../shared/_core/errors.js";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";

const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

function secretKey() {
  if (!ENV.cookieSecret) throw new Error("SESSION_SECRET/JWT_SECRET is not configured");
  return new TextEncoder().encode(ENV.cookieSecret);
}

function requireGoogleConfig() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Google OAuth credentials are not configured");
  }
  return { clientId, clientSecret, redirectUri };
}

export function googleScopes() {
  return [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/spreadsheets",
  ];
}

export async function createLoginState(redirectUri: string) {
  return new SignJWT({ redirectUri, nonce: crypto.randomBytes(16).toString("hex") })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(secretKey());
}

export async function verifyLoginState(state: string) {
  const { payload } = await jwtVerify(state, secretKey(), { algorithms: ["HS256"] });
  if (typeof payload.redirectUri !== "string" || !payload.redirectUri) {
    throw new Error("OAuth state has no redirect URI");
  }
  return payload.redirectUri;
}

export async function buildGoogleLoginUrl(redirectUri: string) {
  const { clientId, redirectUri: callbackUri } = requireGoogleConfig();
  const state = await createLoginState(redirectUri);
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", callbackUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("scope", googleScopes().join(" "));
  url.searchParams.set("state", state);
  return url.toString();
}

async function exchangeCode(code: string) {
  const { clientId, clientSecret, redirectUri } = requireGoogleConfig();
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const payload = (await response.json()) as { access_token?: string; error?: string };
  if (!response.ok || !payload.access_token) throw new Error(payload.error || "Google token exchange failed");
  return payload.access_token;
}

export async function getGoogleIdentity(code: string) {
  const accessToken = await exchangeCode(code);
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const profile = (await response.json()) as { sub?: string; email?: string; name?: string };
  if (!response.ok || !profile.sub || !profile.email) throw new Error("Google identity lookup failed");
  return { ...profile, accessToken };
}

export async function createSession(user: Pick<User, "openId" | "name" | "email">) {
  return new SignJWT({ openId: user.openId, name: user.name ?? "", email: user.email ?? "" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(Math.floor((Date.now() + ONE_YEAR_MS) / 1000))
    .sign(secretKey());
}

export async function authenticateRequest(req: Request): Promise<User> {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  const bearer = typeof authHeader === "string" && authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : undefined;
  const cookie = req.headers.cookie?.match(new RegExp(`${COOKIE_NAME}=([^;]+)`))?.[1];
  const token = bearer || cookie;
  if (!token) throw ForbiddenError("Authentication required");

  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (typeof payload.openId !== "string") throw new Error("Invalid session");
    const user = await db.getUserByOpenId(payload.openId);
    if (!user) throw new Error("User not found");
    return user;
  } catch {
    throw ForbiddenError("Invalid session");
  }
}

export function encodeUserForRedirect(user: User) {
  return Buffer.from(JSON.stringify({
    id: user.id,
    openId: user.openId,
    name: user.name,
    email: user.email,
    loginMethod: user.loginMethod,
    lastSignedIn: user.lastSignedIn,
  }), "utf8").toString("base64url");
}

export function decodeUserFromRedirect(value: string) {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

export async function upsertGoogleUser(profile: { sub: string; email: string; name?: string }) {
  await db.upsertUser({
    openId: `google:${profile.sub}`,
    email: profile.email,
    name: profile.name || profile.email,
    loginMethod: "google",
    lastSignedIn: new Date(),
  });
  const user = await db.getUserByOpenId(`google:${profile.sub}`);
  if (!user) throw new Error("User could not be created");
  return user;
}
