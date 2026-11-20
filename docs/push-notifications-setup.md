# Phone notifications in the Android app

The Raiyani Agro Seeds app shows notifications in the phone's notification bar, with sound, even when the app is closed:

- **Customers:** back-in-stock alerts and order/delivery updates.
- **Admin (you):** a new order has been placed.

Notifications use the language the person chose on the website (English or ગુજરાતી). Tapping one opens the right page in the app.

There are two ways a notification can reach the phone:

| Method | Speed | Setup |
|---|---|---|
| Background check (already on) | Within about 15 minutes | None |
| Firebase (instant) | A few seconds | One-time setup below |

Both can run together. A notification is never shown twice.

## What people need to do

1. Install the app version **1.1.0** or newer from the website (it installs over the old one).
2. Sign in inside the app.
3. On Android 13 and newer, tap **Allow** when the app asks to send notifications.
   If they tapped "Don't allow", they can turn it on in **Settings → Apps → Raiyani Agro Seeds → Notifications**.

Some phone brands (Xiaomi, Oppo, Vivo, Realme) stop apps in the background to save battery. If notifications come late or not at all, set **Battery → No restrictions** for the app.

## Turning on instant notifications (Firebase, free)

### 1. Create the Firebase project

1. Go to <https://console.firebase.google.com> and sign in with the shop's Google account.
2. **Create a project** (for example "Raiyani Agro Seeds"). Google Analytics is not needed.

### 2. Connect the Android app

1. In the project, click the **Android** icon to add an app.
2. **Android package name:** `com.raiyani.agroseeds` (must be exactly this).
3. Click **Register app**, then **Download google-services.json**.
4. Put that file in the project at `android/app/google-services.json`.
5. Rebuild the APK and copy it to `client/public/raiyani-agro-seeds.apk` (or ask Claude to do it).

### 3. Let the website send notifications

1. In Firebase, open **Project settings → Service accounts**.
2. Click **Generate new private key** and download the JSON file.
   **This file is a secret.** Do not put it in the project folder or on GitHub.
3. In the Render dashboard, open the **raiyaniagroseeds** service → **Environment**.
4. Add `FIREBASE_SERVICE_ACCOUNT` and paste the **entire contents** of that JSON file as the value.
5. Save. Render restarts the website with instant notifications switched on.

### 4. Check it works

1. Install the new APK on a phone, sign in, and allow notifications.
2. Close the app.
3. From another device, place a test order. The admin phone should get a "new order" notification within seconds.

## How it works (for developers)

- `android/.../NotificationCheckService.java`: Android JobScheduler runs about every 15 minutes, calls `GET /api/notifications` with the signed-in session, and shows new unread items.
- `android/.../PushMessagingService.java`: receives Firebase data messages. Only active when `google-services.json` was present at build time (`BuildConfig.FIREBASE`).
- `server/services/push.js`: sends Firebase HTTP v1 messages to every phone registered to the account (`DeviceToken` collection). It does nothing unless `FIREBASE_SERVICE_ACCOUNT` is set. Phones that uninstalled the app are removed automatically.
- `POST /api/notifications/devices`: the app registers its Firebase token after sign-in. If another account signs in on the same phone, the token moves to that account.
- Only newly created notifications are pushed, so server retries never alert twice.

Note: on Render Free, the background checks from phones also keep the website awake, which uses more of the free monthly hours.
