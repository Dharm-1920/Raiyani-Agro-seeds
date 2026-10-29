# Direct Meta WhatsApp setup

Sender requested by the shop owner: **+91 99250 21235**. Display name to submit: **Raiyani Agro Seeds**.

The website integration supports automatic PDF bills for website orders and counter sales, consented payment reminders every 15 days until paid, and optional WhatsApp back-in-stock alerts. Registration, Meta approval and live credentials are still required. WhatsApp Web login does not connect the Cloud API.

## Connect the business account

1. Sign in to [Meta Business Suite / WhatsApp Manager](https://business.facebook.com/wa/manage/home/) with the shop's Facebook administrator account. Select or create the business portfolio.
2. In [Meta for Developers](https://developers.facebook.com/apps/), create/select the shop's app with the WhatsApp business messaging use case. Complete the Cloud API setup and attach the correct WhatsApp Business Account.
3. Add and verify the requested sender number. Confirm that the displayed number is **+91 99250 21235** and record its **Phone Number ID** (a separate numeric ID, not the phone number). If the number is already in the Business app, check the available coexistence/onboarding options first; do not delete or migrate the phone account without the owner's explicit approval.
4. Submit the shop display name, business details and logo. Business verification and display-name approval are controlled by Meta. A phone number can still be visible in Business Info.
5. Configure billing/production access in Meta as required. Create a server-side system-user access token with the app/business permissions and phone-number asset access needed to send messages. Never put tokens in frontend code, screenshots, commits or chat.

## Message templates

Submit and obtain Meta approval for these templates. Names below are suggested names; put the **actual approved name** into the matching environment setting. Meta determines the category and may reject or recategorize a template. Start with English (US), language code `en_US`.

| Setting | Suggested name | Required components |
| --- | --- | --- |
| `META_WHATSAPP_INVOICE_TEMPLATE` | `raiyani_purchase_invoice` | **Document header** (PDF); body has positional `{{1}}` bill/order reference and `{{2}}` total amount. No dynamic buttons. |
| `META_WHATSAPP_REMINDER_TEMPLATE` | `raiyani_payment_reminder` | Body has `{{1}}` customer name, `{{2}}` bill reference, `{{3}}` outstanding amount. No document header or dynamic buttons. |
| `META_WHATSAPP_RESTOCK_TEMPLATE` | `raiyani_back_in_stock` | Body has `{{1}}` product name and `{{2}}` full product URL. No document header or dynamic buttons. |

Suggested body text:

- Invoice: `Thank you for shopping with Raiyani Agro Seeds. Your bill {{1}} totals {{2}}. Your PDF bill is attached. An unpaid bill is not a payment receipt. Reply STOP to stop WhatsApp messages.`
- Reminder: `Hello {{1}}, your Raiyani Agro Seeds bill {{2}} has an outstanding balance of {{3}}. Please contact the shop if you have already paid. Reply STOP to stop WhatsApp messages.`
- Restock: `The product {{1}} you asked about is available again at Raiyani Agro Seeds. View it here: {{2}}. Availability may change. Reply STOP to stop WhatsApp messages.`

Supply sample values and a sample PDF to Meta during template approval. Optional Gujarati template variants must use the same component/variable structure and language `gu`; their names go into the corresponding `_GU` settings. Without a Gujarati variant, the message envelope uses the approved English template, while the attached PDF still follows the bill's selected language.

## Server settings (Render Environment)

Use the settings documented in [the environment example](../server/.env.example). Select `WHATSAPP_PROVIDER=meta`. Configure the verified sender's Phone Number ID, supported Graph API version from the Meta app, access token, app secret, a randomly generated webhook verify token and the approved template names. `META_WHATSAPP_BUSINESS_NUMBER` documents the intended sender; the Phone Number ID actually chooses it.

Keep `META_WHATSAPP_SEND_ENABLED=false` until setup is verified. No WhatsApp messages are sent while it is false. Do not place credentials in browser local storage or client environment variables.

Webhook callback URL:

`https://raiyaniagroseeds.onrender.com/api/whatsapp/webhook`

Configure this URL and the matching verify token in the Meta app, subscribe the WhatsApp Business Account to the app and subscribe to **messages** webhook events. GET challenges use constant-time token comparison. POST callbacks require the app-secret HMAC-SHA256 signature on the original body and the expected Phone Number ID. Delivery status callbacks update accepted jobs separately from provider acceptance; STOP replies suppress future Meta sends and stop payment reminders.

## Activate and check

1. Deploy the integration with sending disabled and verify the callback in Meta.
2. Confirm sender number, approved template names/languages and token/asset permissions using Meta's read-only account views. Do not rely on a temporary token for ongoing production use.
3. Inspect outstanding queued invoices/reminders before enabling: previously consented jobs may be waiting for the provider connection. Agree with the owner on whether to release or cancel that backlog.
4. Set `META_WHATSAPP_SEND_ENABLED=true` only once the owner is ready. Customer invoice delivery requires the existing invoice WhatsApp permission; stock alerts require the new explicit WhatsApp checkbox and valid number. Old website-only stock subscriptions are never silently enrolled in WhatsApp.
5. With the owner's chosen test recipient, test an actual bill PDF, a back-in-stock alert and the STOP flow. Test 15-day scheduling with isolated tests instead of changing customer financial records. Provider acceptance is not proof of handset delivery; check Meta's delivery webhook status.

The outbox retries temporary failures. A transport timeout after provider acceptance can cause a duplicate on retry because the Cloud API message call has no application-level idempotency key in this integration. Restock subscriptions queue one delivery job per subscription, and the worker rechecks availability, cancellation, consent and opt-outs immediately before sending. A product sold out again before processing is cancelled rather than advertised as available. A new alert can be requested in a future stock cycle.

Reference: [Meta Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api/), [message templates](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-message-templates/).
