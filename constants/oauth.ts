import * as Linking from "expo-linking";
import * as ReactNative from "react-native";

const env = {
  // Must be the public URL of the independent backend.
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? "",
  // Keep this in sync with app.config.ts.
  deepLinkScheme: "manusstudio",
};

export const API_BASE_URL = env.apiBaseUrl;
export const OAUTH_PORTAL_URL = "";
export const OAUTH_SERVER_URL = "";
export const APP_ID = "";
export const OWNER_OPEN_ID = "";
export const OWNER_NAME = "";

export function getApiBaseUrl(): string {
  if (API_BASE_URL) return API_BASE_URL.replace(/\/$/, "");
  if (ReactNative.Platform.OS === "web" && typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    const apiHostname = hostname.replace(/^8081-/, "3000-");
    if (apiHostname !== hostname) return `${protocol}//${apiHostname}`;
  }
  return "";
}

export const SESSION_TOKEN_KEY = "app_session_token";
export const USER_INFO_KEY = "independent-runtime-user-info";

export const getRedirectUri = () =>
  Linking.createURL("/oauth/callback", { scheme: env.deepLinkScheme });

export const getLoginUrl = () => {
  const base = getApiBaseUrl();
  if (!base) throw new Error("EXPO_PUBLIC_API_BASE_URL is not configured");
  const url = new URL(`${base}/api/auth/google/start`);
  url.searchParams.set("redirectUri", getRedirectUri());
  return url.toString();
};

export async function startOAuthLogin(): Promise<string | null> {
  const loginUrl = getLoginUrl();
  if (ReactNative.Platform.OS === "web") {
    if (typeof window !== "undefined") window.location.href = loginUrl;
    return null;
  }
  // Android may return false for canOpenURL() on valid HTTPS browser URLs.
await Linking.openURL(loginUrl);

  return null;
}
