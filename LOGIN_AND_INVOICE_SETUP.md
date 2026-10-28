# Login, password recovery and invoice delivery

Customer login and signup now start with phone, Google and email choices. Phone sign-in uses the saved phone number **and account password**, with no SMS charge. Indian ten-digit numbers normalize to +91; international numbers need their country code. Email remains required at signup for invoices and recovery. Existing email/password accounts continue to work.

New passwords need at least eight characters and at most 72 UTF-8 bytes. Password reset links expire after 30 minutes and work once. Resetting a password signs out previous sessions. Email verification links expire after 24 hours and work once. Tokens are hashed in MongoDB; raw tokens are never returned by the API or written to logs. Email links place the token in the URL fragment, which the browser removes after reading it.

## Current activation requirements

The code works without external providers: email/phone password login, PDF downloads and manual WhatsApp sharing remain available. Google, reset emails, verification emails and automatic invoice messages require the accounts below. A visible disabled Google choice means Google has not been connected. The application does not pretend that an unconfigured service sent a message.

No production credentials are included in the source. Store credentials in Render's **Environment** settings, never in Git, the browser bundle, or a chat message. See [the environment example](server/.env.example) for all keys.

The owner confirmed the new shop mailbox is **raiyaniagroseeds.support@gmail.com**. Use this address for website contact details, the verified invoice/recovery sender (`MAIL_FROM`), and Google OAuth support/developer contact details. Sign in with this business account when setting up providers. An existing Google Cloud project or provider account owned by another login does not automatically move to this mailbox. Customer email addresses and the existing administrator login are separate account records and are not changed by updating the shop contact.

### Email connection prepared on 28 October 2026

- Brevo lists `Raiyani Agro Seeds <raiyaniagroseeds.support@gmail.com>` as a verified sender.
- Render's existing shop service has `MAIL_FROM`, `APP_URL`, and `BREVO_API_KEY` saved. The credential is stored only in Render, not in this repository.
- The dedicated key is named **Raiyani Render transactional email**, with restricted access to **Transactional email** only. Its displayed expiry is **28 October 2027**; Brevo also expires it after 90 days of inactivity. Rotate it in Render before expiry.
- These settings were saved without triggering a deploy. New email behavior requires deployment of this feature and a real verification/reset/invoice delivery check.
- Google OAuth and automatic WhatsApp still need their separate credentials. Email sender verification does not complete either integration.
- Brevo's existing account/security email is separate from its verified sender. Confirm the account profile separately if transferring account ownership to the support mailbox.

## 1. Google sign-in (one-time setup)

1. In [Google Cloud Console](https://console.cloud.google.com/), choose the business-owned project and configure the OAuth consent screen with the shop name, contact email and appropriate audience.
2. Create an **OAuth client ID → Web application**.
3. Add this exact authorized redirect URI:
   `https://raiyani-agro-seeds.onrender.com/api/auth/google/callback`
4. In Render, set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` to that URI, and `APP_URL=https://raiyani-agro-seeds.onrender.com`.
5. Save and redeploy. In Google testing mode, add the accounts permitted to test. Complete Google's publishing/verification requirements before opening sign-in to all customers.
6. Test new-account signup, returning Google login and logout.

Existing password accounts must first sign in with their password and choose **My account → Sign-in & invoices → Connect Google**, using the same email. Matching emails are deliberately not linked silently. New Google accounts have verified emails; they can use **Set a password** to enable email/phone password sign-in.

The server verifies Google's ID-token signature, audience, expiry, verified email and nonce. OAuth uses a short-lived HttpOnly state cookie and PKCE; it never sends your Google client secret to the browser.

Official references: [Google OAuth web-server flow](https://developers.google.com/identity/protocols/oauth2/web-server), [Google ID-token verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).

## 2. Email invoices and recovery on Render Free

Render Free [blocks SMTP ports 25, 465 and 587](https://render.com/docs/free), so use the HTTPS integration rather than Gmail SMTP on this hosting plan.

1. Create or sign in to the shop's [Brevo](https://www.brevo.com/) account. Choose a suitable plan and verify the business sender email; complete any provider approval requirements. Do not enable a paid plan without the owner's approval.
2. Verify `raiyaniagroseeds.support@gmail.com` as the sender before enabling delivery. Provider requirements for sender domains and verification can change.
3. Create a transactional-email API key and enter it directly in Render as `BREVO_API_KEY`.
4. Set `MAIL_FROM=raiyaniagroseeds.support@gmail.com` after the provider verifies it, and `APP_URL=https://raiyani-agro-seeds.onrender.com`.
5. Save and redeploy. Use a test customer account you control to request a verification link and reset link. Confirm the links point at the public shop and work once.
6. Verify the customer's email, then place a test purchase to confirm the actual PDF invoice arrives and its payment status is correct.

For local development or a host allowing SMTP, the alternative keys are `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and `MAIL_FROM`. Port 465 uses `SMTP_SECURE=true`; port 587 uses `SMTP_SECURE=false` with required STARTTLS. Use an app password or provider credential when required, never a normal mailbox password. Brevo takes precedence when its API key is present.

Automatic email invoices wait for email verification. The account page has **Send verification email**. Resetting the password through a valid emailed link also verifies email ownership. Google-verified users can receive invoices immediately once sending is configured.

Official reference: [Brevo transactional email API](https://developers.brevo.com/reference/send-transac-email).

## 3. WhatsApp: free sharing and optional automatic delivery

**Free manual sharing:** each order has **Share invoice on WhatsApp**. Supported phones open the system share sheet with the PDF; choose WhatsApp there. Other browsers download the PDF and show **Open WhatsApp**, with instructions to attach the downloaded file. A WhatsApp text link alone does not attach a PDF.

**Automatic delivery:** requires a WhatsApp Business messaging provider and may incur usage charges. This implementation supports Twilio; sending stays disabled until configured.

1. Set up an approved Twilio WhatsApp sender and an approved utility **document/media** template. Verify all provider, business and regional requirements.
2. Configure the template body with `{{1}}` = short order reference and `{{2}}` = total, without implying pending payments have been received.
3. Configure its media URL as `https://raiyani-agro-seeds.onrender.com/{{3}}`. Variable `{{3}}` is the expiring PDF path, including its `.pdf` suffix. Submit a valid public sample PDF when requesting template approval; use no real customer details in the sample.
4. In Render set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` (international number), and `TWILIO_WHATSAPP_CONTENT_SID` (the approved document template).
5. At checkout, the customer must tick the invoice consent checkbox for the displayed delivery phone number. It is unchecked by default. No WhatsApp job is created without that consent.
6. Test with a consenting number you control. The PDF URL is a bearer link that expires after seven days; anyone holding it can access that invoice during that period. Normal invoice downloads remain protected by account ownership. Revoking the order's WhatsApp consent or removing its delivery job invalidates the media link.

Templates are required for business-initiated messages outside WhatsApp's customer-service window. The integration uses the approved template for every automatic invoice. Invoices do not enable marketing messages.

Official references: [Twilio media templates](https://www.twilio.com/docs/content/twilio-media), [sending approved templates](https://www.twilio.com/docs/content/send-templates-created-with-the-content-template-builder).

## Delivery behavior and operations

- Creating an order records a durable invoice marker and account email, language and WhatsApp consent. It does not wait for an external messaging service or cancel a purchase because delivery failed.
- A worker checks every 15 seconds while the API is running. It queues at most one job per order and channel, claims jobs with a five-minute lease and retries provider failures with backoff, up to six attempts. A provider outage cannot create another order or change stock.
- Unconfigured channels remain queued. Unverified email waits without consuming provider attempts. Pre-existing orders without the new marker are not automatically messaged.
- **My orders → Email & WhatsApp delivery** shows queue, missing verification, unavailable provider, failure, or provider acceptance. Acceptance means the provider accepted the message, not confirmed inbox/handset delivery. This implementation does not consume delivery webhooks.
- A process crash after a provider accepted a message but before the database recorded success can cause a duplicate on retry. SMTP and this Twilio integration do not guarantee exactly-once delivery.
- Render Free sleeps when idle. Pending jobs resume after the service wakes; there is no guaranteed dispatch time while the service is asleep.
- After six failures, inspect the delivery record and provider logs, fix the cause, then reset that job to `pending`, `attempts: 0`, `nextAttemptAt: now` through a trusted database administration process. Never mark a failed job as accepted to hide a sending problem.

## Validation

Run `npm test` from [server](server/) and `npm run build` from [client](client/). Added tests cover signup, normalized phone login, reset-link expiry/reuse, session revocation, OAuth state/nonce/linking, email-provider payloads, invoice PDF attachments, consent, retries and private invoice links. Provider calls use isolated test doubles, so they do not send messages or alter the live shop. Actual Google sign-in and real email/WhatsApp delivery still require the activation checks above.
