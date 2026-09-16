# Self-hosting Stealth Mail Studio

This setup removes the Manus OAuth portal. The backend and MySQL database run on your own PC. The PC must remain on whenever the Android APK needs the backend.

## Backend-only environment file

Copy `.env.example` to `.env` and fill in the Google values you already have:

```bash
cp .env.example .env
```

Set these values in `.env`:

```text
JWT_SECRET=<long random value>
GOOGLE_OAUTH_CLIENT_ID=<your Google client ID>
GOOGLE_OAUTH_CLIENT_SECRET=<your Google client secret>
GOOGLE_OAUTH_REDIRECT_URI=https://YOUR_PUBLIC_BACKEND_HOST/api/google/oauth/callback
```

Do not put `.env` in GitHub or inside the APK.

## Start the local backend and MySQL

Install Docker Desktop, then from the project folder run:

```bash
docker compose up -d --build
docker compose exec api pnpm db:push
```

Check the service:

```bash
curl http://localhost:3000/api/health
```

Expected response:

```json
{"ok":true,"timestamp":...}
```

## Make the backend reachable by the Android phone

For a free temporary HTTPS URL, install `cloudflared` and run:

```bash
cloudflared tunnel --url http://localhost:3000
```

Copy the generated `https://...trycloudflare.com` URL. It is valid while that tunnel process remains running. The PC and phone both need internet access.

Set the Google redirect URI to:

```text
https://YOUR_TRYCLOUDFLARE_DOMAIN/api/google/oauth/callback
```

The redirect URI must be added to the same Google OAuth client in Google Cloud Console and must exactly match `GOOGLE_OAUTH_REDIRECT_URI` in `.env`.

## Configure the Expo APK

In the Expo project preview environment, add:

```text
EXPO_PUBLIC_API_BASE_URL=https://YOUR_TRYCLOUDFLARE_DOMAIN
```

Then build a new APK:

```bash
eas build --platform android --profile preview
```

Install the new APK while the Docker backend and Cloudflare tunnel are running.

## Security

The following values stay only in `.env` on the backend:

```text
GOOGLE_OAUTH_CLIENT_SECRET
JWT_SECRET
DATABASE_URL
```

The APK receives only the public backend URL. Google access and refresh tokens are encrypted before being stored in MySQL.

## Limitations of the free setup

The backend is not available when the PC is off, Docker is stopped, or the tunnel process ends. The temporary tunnel URL can change, requiring the Google redirect URI and Expo preview variable to be updated and a new APK build. For a stable 24/7 URL, use a paid or account-based hosted service later.
