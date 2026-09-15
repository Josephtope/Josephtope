import { describe, expect, it } from "vitest";

describe("Google OAuth server credentials", () => {
  it("is accepted by Google's token endpoint as a client", async () => {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
    expect(clientId).toMatch(/\.apps\.googleusercontent\.com$/);
    expect(clientSecret).toMatch(/^GOCSPX-/);
    expect(redirectUri).toMatch(/^https:\/\/.+\/api\/google\/oauth\/callback$/);

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId!,
        client_secret: clientSecret!,
        code: "credential-validation-only",
        redirect_uri: redirectUri!,
        grant_type: "authorization_code",
      }),
    });
    const payload = (await response.json()) as { error?: string };
    expect(payload.error).toBe("invalid_grant");
  });
});
