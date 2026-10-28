# Raiyani Agro Seeds

React/Vite storefront and admin panel, Node/Express API, MongoDB account storage, built-in PDF purchase invoices.

Choose English or ગુજરાતી on customer or admin login. The interface and uploaded logo switch together; the preference is remembered in the browser. See **LANGUAGE_AND_LOGO_SETUP.md**.

Visitors start at the public cover page at `/`. Its Explore our shop button opens the storefront at `/home`, with sign-in required for shopping and checkout. Each account has its own persisted cart, profile, saved delivery details and order history. Admin login is at `/admin/login`.

Checkout offers Cash on Delivery and UPI QR. QR payment uses the shop's receiving UPI ID, order total and order reference. Customers submit a UPI reference; admins verify bank receipt and manually confirm payment. Customers and admins can cancel eligible orders before shipping, restoring stock once. Refunds are arranged manually by the shop.

## Run locally

Prerequisites: Node 22+, MongoDB (or `docker compose up -d` for MongoDB).

```bash
cd server
cp .env.example .env
# Edit JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD, SHOP_UPI_ID and INTERNAL_API_KEY.
npm install
npm run seed   # First installation only, to create demo products and admin.
npm run dev
```

In another terminal:

```bash
cd client
npm install
npm run dev
```

Open `http://localhost:5173`. Create a customer account from Login, or choose Administrator sign in. Download purchase invoices from My Orders or Admin > Orders. The Node backend generates English/Gujarati PDFs directly; no Python process is needed. See **QR_AND_PURCHASE_INVOICE_UPDATE.md** for QR configuration and invoice setup.

## Updating an existing project

Preserve your current `server/.env`, product uploads and MongoDB data when copying this source. Add SHOP_UPI_ID and SHOP_UPI_NAME to your environment and restart both services. No database reset or reseeding is needed. See **PAYMENT_AND_CANCELLATION_SETUP.md** and **ACCOUNT_AND_LOGIN_UPDATE.md**.

## Features

- Customers: account registration/login, product search/filter/sort, persisted cart, saved profile and delivery details, COD/UPI QR checkout, owned orders and invoices, cancellation before shipping.
- Admin: product add/edit/hide/remove, customers/messages, dashboard, order status, bank payment confirmation, cancellation and completed refund records.
- Backend: password hashing, cookie-based authentication, role/ownership checks, server price calculation, atomic stock reservations and retry-safe cancellation.

## Code and validation

See **UI_EDIT_GUIDE.md** for UI files and **ADMIN_SETUP.md** for admin access. APIs: `/api/auth/*`, `/api/account/cart`, `/api/products`, `/api/orders`, `/api/payments/options`, `/api/admin/*`, `/api/contact`.

`npm test` in server runs 85 backend tests. `npm run build` in client builds the frontend. Mocked browser checks cover login-first access, account isolation, QR/reference submission, COD checkout, account recovery, invoice consent and admin management. Actual MongoDB/bank transactions and messaging providers require end-to-end verification with accounts you control.

## Login and invoice delivery

Customers can choose phone/password, email/password or Google sign-in/signup when configured. Forgot/reset password uses expiring, one-use email links. Resetting a password invalidates prior sessions. Verified customers can receive PDF purchase invoices by email; opted-in customers can also receive automatic WhatsApp PDFs through a configured provider. Manual PDF sharing to WhatsApp remains available without a messaging provider.

See [login and invoice setup](LOGIN_AND_INVOICE_SETUP.md) to activate Google, email and optional WhatsApp delivery. These external features stay unavailable until the corresponding provider credentials and approved sender/template are connected. Email uses HTTPS on Render Free because that plan blocks SMTP ports. No paid messaging service is enabled by these code changes.

## Gujarati products

Product names, descriptions, categories and units have saved Gujarati fields. Adding a product or changing its English text automatically generates the Gujarati version before saving. Open **Gujarati product details** in the admin editor to generate a preview or enter corrections. Updating a price or stock keeps the translations.

Automatic translation uses the [MyMemory API](https://mymemory.translated.net/doc/spec.php), needs internet access and is subject to the provider's usage limits. If it is unavailable, the product stays unsaved until you retry or fill the Gujarati fields manually. Translations are stored with products, so customers do not need a translation service request to switch languages. Optional `MYMEMORY_EMAIL` configuration is documented in [the environment example](server/.env.example).

For existing inventory, run `node backfill-gujarati.js` from the server directory. It adds missing translations without resetting products, stock or customer data. New order lines retain the Gujarati product name for order history and invoices.

Before production, replace sample products/prices and shop details in `client/src/config.js`, configure the real receiving UPI account, use HTTPS and production environment secrets, set CLIENT_URL, and set SHOP_NAME and SHOP_ADDRESS for invoice details.
