import crypto from "node:crypto";
import { ENV } from "./env";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/spreadsheets",
];

function requireConfig() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) throw new Error("Google OAuth credentials are not configured.");
  if (!ENV.cookieSecret) throw new Error("Server signing secret is not configured.");
  return { clientId, clientSecret, redirectUri };
}

function base64url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function signingKey() {
  return crypto.createHash("sha256").update(ENV.cookieSecret).digest();
}

export function createGoogleState(userId: number) {
  const payload = `${userId}.${Date.now()}.${base64url(crypto.randomBytes(18))}`;
  const signature = crypto.createHmac("sha256", signingKey()).update(payload).digest("base64url");
  return `${base64url(payload)}.${signature}`;
}

export function verifyGoogleState(state: string): number {
  const [encodedPayload, signature] = state.split(".");
  if (!encodedPayload || !signature) throw new Error("Invalid Google OAuth state.");
  const payload = Buffer.from(encodedPayload, "base64url").toString("utf8");
  const expected = crypto.createHmac("sha256", signingKey()).update(payload).digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error("Invalid Google OAuth state signature.");
  const [userIdText, issuedAtText] = payload.split(".");
  const userId = Number(userIdText);
  const issuedAt = Number(issuedAtText);
  if (!Number.isInteger(userId) || !Number.isFinite(issuedAt) || Date.now() - issuedAt > 10 * 60 * 1000) throw new Error("Expired Google OAuth state.");
  return userId;
}

export function buildGoogleAuthorizationUrl(userId: number) {
  const { clientId, redirectUri } = requireConfig();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("scope", GOOGLE_SCOPES.join(" "));
  url.searchParams.set("state", createGoogleState(userId));
  return url.toString();
}

export async function exchangeGoogleCode(code: string) {
  const { clientId, clientSecret, redirectUri } = requireConfig();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri, grant_type: "authorization_code" }),
  });
  const payload = (await response.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string };
  if (!response.ok || !payload.access_token) throw new Error(payload.error || "Google token exchange failed.");
  return payload;
}

export async function getGmailProfile(accessToken: string) {
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers: { authorization: `Bearer ${accessToken}` } });
  const payload = (await response.json()) as { emailAddress?: string; historyId?: string; error?: { message?: string } };
  if (!response.ok || !payload.emailAddress) throw new Error(payload.error?.message || "Could not read the connected Gmail profile.");
  return payload;
}

export function encryptSecret(value: string) {
  if (!ENV.cookieSecret) throw new Error("Server signing secret is not configured.");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", signingKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map(base64url).join(".");
}

export function decryptSecret(value: string) {
  if (!ENV.cookieSecret) throw new Error("Server signing secret is not configured.");
  const [ivText, tagText, ciphertextText] = value.split(".");
  if (!ivText || !tagText || !ciphertextText) throw new Error("Invalid encrypted secret.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", signingKey(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextText, "base64url")), decipher.final()]).toString("utf8");
}

export async function refreshGoogleAccessToken(refreshToken: string) {
  const { clientId, clientSecret } = requireConfig();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
  });
  const payload = (await response.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!response.ok || !payload.access_token) throw new Error(payload.error || "Google access-token refresh failed.");
  return payload;
}
