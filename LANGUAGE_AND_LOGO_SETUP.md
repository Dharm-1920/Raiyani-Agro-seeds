# English / Gujarati interface and logos

Choose English or ગુજરાતી using Language / ભાષા on the customer Login/Create account pages or admin sign-in page. A selector also remains in the storefront menu and admin top bar. On a phone, open the storefront menu to change language after login.

English uses `client/public/assets/logo-en.png`. Gujarati uses `client/public/assets/logo-gu.png`. These are the original uploaded images, with their embedded lettering unchanged. Logos switch on customer login, registration, storefront header/footer, admin sign-in and admin panel. The interface uses the Gujarati spelling રૈયાણી.

The selected language is remembered in this browser under `raiyani-language`. It persists after refresh/logout. Switching preserves typed form values and current selections. Product names/descriptions, customer information, contact messages, UPI IDs, bank transaction references and API/database identifiers are not automatically translated. Purchase invoices now use the selected language and corresponding logo.

## Updating your installation

1. Extract this ZIP into a fresh folder. Copy your existing `server/.env` and product uploads. Preserve the same MongoDB connection string and database; no reset or reseeding is needed.
2. Run `INSTALL_WINDOWS.bat` to install the backend/frontend dependencies.
3. Start `npm run dev` inside server and inside client in separate terminals.
4. Open the Vite URL and choose your language on Login. Admins use `/admin/login`.

Your UPI QR, private saved carts/profiles/orders, and user/admin cancellation flows remain. Set the real receiving SHOP_UPI_ID and SHOP_UPI_NAME in the backend environment for QR payment. Existing signed-in sessions enter the store directly; signed-out visitors start at Login.

## Editing

- `client/src/language.jsx`: language state, selector, logo selection and translation helper.
- `client/src/gu.json`: Gujarati interface strings. English is the source interface text; add a matching Gujarati entry when adding a new label.
- `client/src/refined.css`: logo sizing and Gujarati font/layout rules.
- `client/public/assets/fonts`: bundled Noto Sans Gujarati fonts and OFL license, so Gujarati does not depend on an external font service.

Customer-facing controls, checkout/QR, account pages, admin tabs/forms/statuses and common errors are translated. Unlisted backend or network errors fall back to the original message so the error remains available for diagnosis. This update changes presentation; language selection does not change API category/status/payment codes or user-provided data.

## Validation

Client production build and all 26 backend model-double tests passed. Mocked browser checks passed for both login types, both logos, persistent language, preserved form input, Gujarati font loading, category/status/payment codes, mobile/desktop layouts, account isolation, QR checkout, product management and cancellation/refund controls. Real MongoDB and bank payments were not exercised.
