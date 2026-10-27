# Admin panel setup

The store-management area is at **http://localhost:5173/admin/login**. An Admin login link also appears in the storefront footer. Once signed in, open **http://localhost:5173/admin**.

## 1. Configure the backend

Start MongoDB first. Open PowerShell inside the extracted project folder:

```powershell
cd server
npm install
Copy-Item .env.example .env
```

If you already have `server/.env`, keep your existing file instead of copying over it.

Open `.env` and set:

```dotenv
MONGO_URI=mongodb://127.0.0.1:27017/raiyani_agro
ADMIN_EMAIL=admin@gmail.com
ADMIN_PASSWORD=YOUR_PRIVATE_PASSWORD
JWT_SECRET=YOUR_GENERATED_SECRET
```

Replace the password placeholder with a private password of at least 8 characters. Generate a random JWT secret with:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Paste the output into `JWT_SECRET`. Keep the `.env` file private. Do not put it in the frontend code.

## 2. Create the admin and start the API

In the `server` folder:

```powershell
npm run seed
npm run dev
```

Seeding creates the admin account and adds sample products only if the product collection is empty. It leaves an existing admin's password unchanged. Changing `ADMIN_PASSWORD` afterwards does not reset an existing account's password. If that email belongs to an existing customer account, use a new email or have another administrator promote the existing account from Users.

## 3. Open the website

In a second PowerShell window, inside the project folder:

```powershell
cd client
npm install
npm run dev
```

Alternatively double-click `START_UI.bat`. Open `/admin/login` at the localhost URL Vite prints. Sign in with the email and password you configured before the first successful seed.

## Features

- Dashboard: revenue, order counts, customer counts, active products, popular products and low-stock alerts.
- Products: add and edit products, prices, stock, category, unit, description and photos; hide or show products; remove products from the catalogue and storefront with confirmation; search inventory. Removal archives the record so existing orders keep their history. The catalogue displays up to 100 products.
- Orders: filter status, update delivery status, cancel orders before shipment, confirm bank payment and record completed refunds and download invoices. Delivered and cancelled orders are final. Purchase invoices are generated directly by Node; no Python service is needed.
- Users: search customers, grant or remove admin roles, delete accounts. You cannot remove your own account or change your own role.
- Messages: read contact-form messages, mark them read, delete them.
- Loading/error states, retry buttons, refresh action, mobile layouts and sign-out.

## Where to change admin UI code

- `client/src/admin.jsx`: admin login, dashboard and management screens.
- `client/src/admin.css`: sidebar, cards, tables, login design and mobile layout.
- `client/src/App.jsx`: admin routes and permission guard.
- `server/routes/admin.js`: management APIs.
- `server/routes/auth.js`: admin-only sign-in.

The API verifies admin roles on the server. Customer accounts cannot access the admin API or request hidden inventory. The admin password is never bundled into browser code.

Online payment setup and refund-review steps are in **PAYMENT_AND_CANCELLATION_SETUP.md**.

## Verification

The frontend production build passed. Browser checks with simulated API responses covered route protection, customer rejection, admin login/logout, dashboard data, product create/edit/hide, order status changes, message handling, own-account controls, mobile tabs and error retries. API checks with model stubs covered admin authorization, invalid credentials, HttpOnly sessions, hidden inventory restrictions and final-order status protection.

MongoDB persistence, real product uploads and live invoice delivery require your local services; those integrations were not run against a real database here. Preview screenshots show test data.
