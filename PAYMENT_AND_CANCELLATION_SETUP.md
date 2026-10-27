# UPI QR payments and cancellation

## Configure the payment QR

In your existing `server/.env`, add:

```dotenv
SHOP_UPI_ID=YOUR_REAL_SHOP_UPI_ID
SHOP_UPI_NAME=Raiyani Agro Seeds
```

Replace the first value with the receiving UPI ID from the shop's bank/UPI app, such as the actual `name@bank` shown there. Set the name to the shop's receiving account name. Do not use the placeholder as a payment destination. Restart the backend after editing. Blank or invalid UPI configuration keeps QR payment disabled and leaves Cash on Delivery available.

Each QR is generated locally on the backend with the configured payee, server-calculated order total, INR and order reference. No payment-provider SDK, API key or external QR image service is used. The UPI fields follow [NPCI's QR parameter guidance](https://www.npci.org.in/PDF/npci/upi/circular/2017/Circular18_BankCompliances_to_enbaleUPIMerchantecosystem_0.pdf).

## Customer flow

1. Signed-out visitors start at Login. Create an account or sign in to shop.
2. Choose UPI QR payment at checkout, then Place order & show QR.
3. Scan the QR with a UPI app, or use Open UPI app on your phone. Verify the recipient and full amount before paying. Download QR is available.
4. Enter the 12-digit UPI transaction reference (UTR) from the completed payment. This is a payment claim, not automatic verification.
5. The order remains pending/placed until an admin verifies receipt. My Orders can reopen the same order's QR without making another order or reserving stock again. Avoid paying twice.

The QR is shown after order creation so it has a stable order reference. QR payments are real bank transfers when a real payee is configured; there is no test-mode payment simulator in the application.

## Admin confirmation

Admin > Orders shows the submitted reference. Check the shop's bank/UPI account for the recipient, full amount and reference. Only after confirming receipt, click Confirm bank payment and enter the verified 12-digit reference. The order becomes paid and confirmed. An unpaid QR order cannot be confirmed, shipped or delivered through the status selector. Admin identity and confirmation time are saved.

If money arrives for a cancelled order, Confirm bank payment records it while keeping the order cancelled and flags refund review. Do not fulfill it. Existing historical online orders remain in MongoDB; their old provider checkout/automatic verification is unavailable. Reconcile outstanding historical payments manually with the shop before changing those orders; do not ask customers to pay them again.

## Cancellation and refund

Customers use My Orders > Cancel order. Admins use Admin > Orders > Cancel order. Only placed/confirmed orders can be cancelled before shipment. Stock restoration uses per-product markers to prevent double restocking, including repeated or interrupted requests. Cancelled orders cannot be reactivated by payment confirmation.

Cancellation does not send money back. Check any submitted references, arrange a full refund through the bank/UPI app where required, then use Record completed refund with the completed bank transaction reference. This is an admin record, not a bank API operation. Refund reference, admin and time are saved. Refund notes appear to the customer.

## Install this update

Back up your project and copy the updated source files over it. Preserve `server/.env`, product uploads and MongoDB data. In separate terminals:

```powershell
cd server
npm install
npm run dev
```

```powershell
cd client
npm install
npm run dev
```

Open `http://localhost:5173`. No database reset/reseed is required. Old payment-provider environment keys can be removed; this code no longer reads them.

## Validation

26 backend tests passed using model doubles: account isolation, guest denial, server-priced UPI QR amounts, pending reference submission, admin-only payment/refund confirmation, QR ownership, cancellation and stock restoration. Client production build and mocked browser checks passed for QR/COD checkout, login-first access, account switching, mobile layouts and admin flows. Real MongoDB persistence and actual bank transfers were not exercised in this environment.

## Code

- `server/services/payments.js`: QR generation and refund-review flag.
- `server/routes/payments.js`: configured payment options.
- `server/routes/orders.js`: order creation, owned QR retrieval and reference submission.
- `server/routes/admin.js`: manual bank payment/refund confirmation.
- `client/src/payment.jsx`: QR display, download, UPI link and reference form.
- `client/src/pages.jsx`: checkout and order management.
- `client/src/App.jsx`: login-first guarded routes.
