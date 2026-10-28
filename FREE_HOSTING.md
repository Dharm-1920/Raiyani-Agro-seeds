# Free hosting for the working shop

Chosen setup: one **Render Free web service** serves the React frontend and Express API together. **MongoDB Atlas Free** stores accounts, orders, products, notifications and uploaded product images. The resulting public address will end in `.onrender.com`, subject to name availability.

## Website address updated — 28 October 2026

The shop now runs at `https://raiyaniagroseeds.onrender.com` on a new Free service using the existing Atlas database and image storage. Health, eight products and three product images passed checks at the new address. The previous service remains at `https://raiyani-agro-seeds.onrender.com` during the transition; renaming its dashboard entry did not change that address.

The new service's `APP_URL`, `CLIENT_URL` and `GOOGLE_REDIRECT_URI` use the new address. On 28 October 2026, `https://raiyaniagroseeds.onrender.com/api/auth/google/callback` was saved in the existing Google OAuth client's authorized redirect URIs. A full live Google sign-in returned successfully to `/home`. The old callback remains authorized during the transition. Local callbacks at `http://127.0.0.1:5173/api/auth/google/callback` and `http://localhost:5173/api/auth/google/callback` are also authorized; the ignored local server environment uses the 127.0.0.1 callback and existing client credentials.

## Initial deployment completed — 27 October 2026

Public shop: [raiyaniagroseeds.onrender.com](https://raiyaniagroseeds.onrender.com/). Render service: `srv-dbgvmflg1s2s73cddrbg`. Production admin sign-in, products, three migrated images, route refreshes, guest access restrictions, notifications, saved-cart reads and a Gujarati invoice passed live checks. The local backend suite has 57 passing tests.

Cash on Delivery is enabled. The development UPI value was a placeholder and was deliberately omitted from the public service; add the owner's verified receiving UPI ID to Render's environment before accepting QR payments.

The production owner password is the `PRODUCTION_ADMIN_PASSWORD` value in the ignored local `server/.env.production.local` file. It is different from the development example password and is never stored in this repository. Manage future products and orders through the live website; the local database is a separate development copy after migration.

No Vercel upgrade, paid disk, paid database, or paid Render service is required for this configuration. Keep all billing upgrades and paid add-ons disabled.

## Accounts and source

Sign in to Render, MongoDB Atlas and GitHub in your browser. Render needs access to a Git repository to build the application. Create a private repository and connect only that repository to Render.

The project ignore rules exclude environment secrets, local uploads, build output and dependencies. Never upload `.env.production.local` or the local `.env` to GitHub. Product photos are migrated privately to Atlas, not committed to the source repository.

## Database

The existing Atlas Free cluster can host a separate database for this shop. Use a database user with read/write access only to the new shop database. Existing databases and users must remain unchanged.

Private connection settings and a new production owner password are stored locally in `server/.env.production.local`, which Git ignores. Do not post its contents in chat or documentation.

Before deploying, allow the migration computer's current IP temporarily in Atlas. Run:

```powershell
node server/migrate-to-atlas.js
```

The migration copies the shop's existing records and referenced uploaded images, preserves IDs, and changes the owner admin password only in the new production database. It does not change local shop data. It rejects an unrelated populated destination and supports resuming its own unfinished import. It refuses to rerun after marking the initial migration complete.

Add the Render service's actual outbound IP ranges to Atlas when available. Avoid changing access for unrelated applications in the cluster. Remove temporary migration access after verification.

## Render

Use the checked-in `render.yaml` blueprint or configure the service manually:

- Runtime: Node; Node version: 22.
- Plan/instance: **Free**. No persistent disk.
- Root directory: repository root (leave blank).
- Build: `npm --prefix client ci --include=dev && npm --prefix client run build && npm --prefix server ci --omit=dev`.
- Start: `npm --prefix server start`.
- Health check: `/api/health`.
- Environment: `NODE_ENV=production`, `SERVE_CLIENT=true`, `UPLOAD_STORAGE=mongodb`.
- Secure environment values: production `MONGO_URI` and `JWT_SECRET` from the ignored private settings file.
- UPI receiving details: set the real `SHOP_UPI_ID` and `SHOP_UPI_NAME` to enable QR payments. COD remains available without UPI configuration.

The API and frontend share one HTTPS origin, so existing login cookies, image paths and API requests work without a cross-origin proxy. `RENDER_EXTERNAL_URL` supplies the default CORS origin automatically.

## Free-tier behavior and verification

Render sleeps after 15 minutes without inbound requests, and a first visit may take around a minute to wake it. Notification work resumes when the process wakes; immediate background alerts while it is asleep are unavailable. Usage limits can suspend free service until the next allowance resets. Atlas Free provides 512 MB shared storage, including the shop's images and other databases in that cluster. These are limits of the selected free services, not an always-on hosting guarantee.

Verify the returned public URL: health check, sign-in, profile/address saving, product images, shop routes after refresh, order placement, owner notifications, delivery notifications, invoices, and product uploads surviving a restart. Do not label deployment complete until these checks pass.

References: [Render Free](https://render.com/docs/free), [Express deployment](https://render.com/docs/deploy-node-express-app), [Atlas Free limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/).
