# Login-first and private account update

## What changed

- Opening the website shows Login for signed-out visitors. Shop, product, cart, checkout, contact, account and order pages require sign-in. Create account remains available from Login.
- An existing signed-in session opens the store directly. Admins have their own login at `/admin/login`.
- Carts are saved to the user's MongoDB account, retained after logout, and restored on the next sign-in. Switching accounts loads that account's cart. Old browser-local carts are not imported because their owner cannot be verified.
- My Account lets the signed-in customer save their name, phone and delivery address. Checkout can save delivery details and prefills them next time.
- Orders, payment verification and invoices require authentication. My Orders lists only that customer's orders. Cart/profile writes reject requests from an earlier account after switching sessions. Administrators retain authorized order management access.
- Customers cancel in My Orders. Admins cancel in Admin > Orders. Cancellation is allowed while placed/confirmed, before shipping. Stock is restored once, including safe retries. Online payments need shop refund review; cancellation does not automatically refund money.
- Contact messages are linked to the signed-in account.

## Update your existing installation

1. Back up the current project. Copy this project's source over your installation; preserve your existing `server/.env`, uploaded product images and MongoDB data.
2. In a backend terminal: `cd server`, `npm install`, then `npm run dev`.
3. In a second terminal: `cd client`, `npm install`, then `npm run dev`.
4. Open `http://localhost:5173`. Signed-out visitors see Login; choose Create account to register a customer. Administrators use Administrator sign in.
5. No reseeding or database reset is required. New account fields use the existing users collection.
6. For online payments, follow PAYMENT_AND_CANCELLATION_SETUP.md. Keep your current environment keys.

## Code locations

- `client/src/App.jsx`: login gate and protected routes.
- `client/src/context.jsx`: authentication and account-specific saved carts.
- `client/src/pages.jsx`: login/register, My Account, checkout, My Orders cancellation.
- `server/routes/account.js`: authenticated cart persistence.
- `server/routes/auth.js`: current-user profile updates.
- `server/routes/orders.js`: authenticated orders and customer cancellation.
- `server/routes/admin.js` and `server/services/cancellation.js`: admin cancellation and stock restoration.
- `server/models.js`: persisted account fields and order ownership.

## Validation

`npm test` in server: 26 tests passed, including guest denial, cart/profile/order isolation, user/admin cancellation, stock restoration and payment verification using model doubles. `npm run build` in client passed. Browser checks with mocked APIs passed for mobile login, guarded direct links, account switching/cart retention, profile saving, COD/UPI QR checkout and user/admin flows. A real MongoDB connection and actual bank payments were not exercised here.
