# HomeRedo

The product and Fly app are named HomeRedo (`homeredo` on Fly). Data and update identifiers (`app.architech` on Android, workspace package names, and the local device database) are retained so app updates and saved projects keep working. The production Android download is `release/HomeRedo.apk`.

Take a photo of a room or yard, then change it by chatting or drawing on the photo. Kept features (windows, doors, the house) stay put, and you can set real sizes so new things come out the right size.

- `apps/web`: Next.js app (website + PWA) with the API, sign-in, and the background edit worker
- `apps/android`: Android app (Capacitor) that opens the web app, with the phone's camera and photo picker
- `packages/*`: shared code (`ai` OpenRouter pipeline, `measure` photo measurements, `imaging` masks and compositing, `db` Postgres schema, `core` types, `ui`)

## Run it on this PC

Needs Node 22+, Yarn 1, Docker Desktop, and Android Studio (for the emulator).

```powershell
yarn install
yarn dev            # Postgres + S3 in Docker, web app on http://localhost:3000, Android emulator
yarn dev:web        # same, without Android
yarn dev --mock-ai  # fake AI (no key, no cost) for trying the flow
```

Local development uses Webpack for HMR, including the Android WebView. Tailwind scans only `apps/web/src` and `packages/ui/src` so generated build files cannot trigger stylesheet rebuilds.

The first run creates `apps/web/.env.local`. Put your OpenRouter key in it:

```
OPENROUTER_API_KEY=sk-or-...
```

Local uploads go to a SeaweedFS container that speaks the same S3 API as Cloudflare R2.

## Use it on your Android phone

```powershell
yarn android:apk            # APK that talks to this PC over Wi-Fi
yarn android:apk --install  # also installs it on a phone plugged in over USB
```

The APK lands in `release/HomeRedo.apk`. Copy it to the phone and tap it (allow "Install unknown apps" once), or use `--install`.

While you use it, this PC has to be serving the app:

1. Run `yarn dev:web` and leave it running.
2. Keep the phone on the same Wi-Fi as the PC.
3. Allow port 3000 through Windows Firewall once, in an admin PowerShell. The rule only applies on Private networks, so also set your Wi-Fi to Private (Settings > Network & internet > Wi-Fi > your network > Private network):
   ```powershell
   netsh advfirewall firewall add rule name="HomeRedo dev server" dir=in action=allow protocol=TCP localport=3000 profile=private
   ```
4. Check from the phone's browser that `http://<the address the build printed>:3000` opens HomeRedo.

Each new build installs over the last one and keeps your sign-in and projects. If the PC's Wi-Fi address changes (for example after a router restart), run `yarn android:apk` again. The app then counts as a new site: you sign in again, online projects come back, but projects kept only on the phone stay with the old address. To avoid that, reserve the PC's address in your router's settings (DHCP reservation).

Once production is up, build an APK that works anywhere:

```powershell
yarn android:apk --url https://homeredo.fly.dev
```

## Tests

```powershell
yarn test        # unit and API tests for every package and app (needs Docker running)
yarn typecheck
yarn test:e2e    # browser tests on desktop and phone sizes, against a production build with the fake AI
```

The browser tests build the app, start it on port 3100 with its own `architech_e2e` database, and run in Playwright's Chromium (install it once with `yarn workspace @architech/web playwright install chromium`).

## Deploy to Fly

Production resources are provisioned in the `andrey-yurlov` organization:

- App: `homeredo` (`https://homeredo.fly.dev`)
- Managed Postgres: `architech-db`, cluster `gjpkdon7mke0yln4`, Basic, 10 GB, `iad`
- Private Tigris bucket: `architech-photos`
- Google OAuth: dedicated `HomeRedo` web client in project `hidden-terrain-490803-v7`; External audience, published In production. Client credentials are stored in the `homeredo` Fly app's encrypted secrets.

Fly supplies `DATABASE_URL` and the Tigris `AWS_*` / `BUCKET_NAME` secrets. The app accepts those storage variables as well as the `S3_*` / R2 settings below. Never copy production credentials into source control. `BETTER_AUTH_SECRET` must be random and at least 32 characters; `OPENROUTER_API_KEY` is also required for production AI.

Deploy updates with `fly deploy --ha=false` from this directory. Migrations run before the server accepts traffic. Keep one machine while using startup migrations; moving to multiple app machines requires a serialized migration release step. The health check verifies both Postgres and object storage. A failed storage check stops production startup.

This repository uses Capacitor for Android, rather than Expo/EAS. Build its production APK with `yarn android:apk --url https://homeredo.fly.dev`; Expo project IDs and signing credentials from other apps do not apply. Back up the Android signing keystore securely before distributing builds.

Google sign-in appears when both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are configured. Use a separate Web application OAuth client named HomeRedo, with authorized JavaScript origin `https://homeredo.fly.dev` and redirect URI `https://homeredo.fly.dev/api/auth/callback/google`. Store its credentials as Fly secrets. The Google consent audience must be External and published for public users; only basic identity scopes are used. The Android app opens the system browser and returns through `app.architech://auth`, then exchanges a two-minute, single-use code bound to a random verifier retained by the app. The exchange sets the normal secure session cookie; no long-lived session token appears in the deep link. Tests cover expiry, device binding, session cookies, and concurrent replay. The custom URI scheme matches the existing Android package so installed apps retain their update identity.

For a database incident, use the managed Postgres dashboard's backups/restore tools. After restoring, attach the replacement cluster to `homeredo`, redeploy, and verify `/api/health` and a photo upload. App rollbacks do not undo database migrations; avoid deploying an older image against an incompatible schema.

For a fresh installation in another account:

The `Dockerfile` builds the web app; `fly.toml` runs it with one machine always on, since edits are processed in the background on that machine.

1. Change `app` and `APP_URL` in `fly.toml` if the `homeredo` name is taken, then `fly launch --no-deploy` (keep the existing config).
2. Create a Postgres database (Fly Managed Postgres or any host) and note its connection URL.
3. In Cloudflare R2, create a bucket named `architech` and an R2 API token with Object Read & Write.
4. Set the secrets:
   ```powershell
   fly secrets set DATABASE_URL="postgres://..." BETTER_AUTH_SECRET="<32+ random characters>" OPENROUTER_API_KEY="sk-or-..." R2_ACCOUNT_ID="<cloudflare account id>" S3_ACCESS_KEY_ID="<r2 key id>" S3_SECRET_ACCESS_KEY="<r2 secret>"
   ```
5. `fly deploy`. Database migrations run on startup; `https://<app>.fly.dev/api/health` returns `{"ok":true}` when the app is up.

In production only `APP_URL` can call the API. Add other web origins with the `TRUSTED_ORIGINS` secret (comma separated). The Android app needs no entry because it opens `APP_URL` itself.

## Quick previews and project planning

The default flow is still upload, choose an image-aware suggestion or describe a change, and preview. Add, change and remove controls support indoor and outdoor projects, including outdoor kitchens, grill areas, seating, patio covers, gazebos, play structures and custom work. Short correction prompts help refine placement, size and style without restarting.

Open **Project planner** for persistent editable items, dimensions, materials, rotation, elevations, groups and locks. The planner includes a draggable top-down layout, a rotatable 3D massing view, curved routes, alternatives with undo/redo, reference photos, entered price assumptions, preparation steps and a printable HTML project packet. A project can also start as a blank layout without a photo. Natural-language plan edits and extracting editable items from a preview require the configured vision model; manual controls work independently.

Planning data travels with online/device project transfers. Migration `0004_amused_martin_li.sql` adds the nullable project JSON column. Saves use optimistic revision checks, and browser drafts survive reloads. Generated previews retain the scene revision; obsolete render jobs remain in history without replacing the current cover. Existing projects need no conversion.

Photo-derived dimensions and positions are estimates until checked on site. The 3D view is a conceptual massing model, supporting photos are unaligned context, and quantities/prices are entered assumptions—not surveyed geometry, structural engineering, permit documents or live supplier quotes. Exports open locally and can be printed or saved as PDF. Automated browser tests use mock image generation; they verify workflow and persistence, not live-model visual quality.

### Environment settings

To inspect a real provider result using the bundled sample yard, run `node --env-file=apps/web/.env.local --import tsx scripts/smoke-home-design.mts --live`. This uses the configured paid models and saves the image plus verification details under `apps/web/test-results/live/`.

| Variable | Default | |
| --- | --- | --- |
| `AI_VISION_MODEL` | `google/gemini-4-argon` | reads the photo, plans and checks edits |
| `AI_IMAGE_MODEL` | `openai/gpt-image-2.5-sunburst` | makes the edited photo (OpenRouter Image API) |
| `AI_PROVIDER` | `openrouter` | `mock` for the fake AI |
| `WORKER_CONCURRENCY` | `2` | edits processed at once per machine |
