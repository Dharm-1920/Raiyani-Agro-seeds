# QR setup and purchase invoices

## Why QR payment was disabled

The screenshot shows “UPI QR payment is not configured yet.” This means the backend reported no valid receiving UPI configuration, so checkout disabled the option. It is not a QR scanning failure.

Open your existing `server/.env` and add:

```dotenv
SHOP_UPI_ID=PASTE_YOUR_REAL_RECEIVING_UPI_ID
SHOP_UPI_NAME=Raiyani Agro Seeds
```

Replace the ID placeholder with the exact receiving UPI ID shown in the shop's bank or UPI app. Use the receiving account name for SHOP_UPI_NAME. Do not use a demonstration ID. Save the file and restart the backend with `npm run dev`, then reload checkout. A default shop name is used if SHOP_UPI_NAME is absent.

Admin > Dashboard > UPI QR setup now reports whether QR payment is enabled and identifies missing/invalid configuration. Check payment setup reloads the status after a backend restart. Real bank account validity is not verified by format checks; the shop must check the receiving ID.

Choose UPI QR payment, then Place order & show QR. QR generation happens after the order has a stable reference. The QR uses the stored order total and configured shop payee. Customer UPI references still require shop bank verification; a scanned QR is not automatic proof of payment.

## Purchase invoices

Customers: My Orders > Download purchase invoice.

Admins: Admin > Orders > Download purchase invoice.

The Node backend generates a PDF directly, without starting the Python service. The PDF includes the selected English/Gujarati language, matching logo, stable order-based invoice number, original order date, customer delivery details, purchased items and prices, quantity, delivery fee, total, order/payment status and transaction reference when available. Long orders paginate with repeated headers and page numbers.

Only the owner of an order and administrators can retrieve its invoice. PDFs use stored order data; totals are not taken from the download request. Pending orders clearly state that the invoice is not a payment receipt. Cancelled orders clearly state not to pay. Tax is not itemized; this is the order purchase record, not an automatically calculated GST tax invoice.

Optional invoice shop details in `server/.env`:

```dotenv
SHOP_NAME=Raiyani Agro Seeds
SHOP_ADDRESS=Gondal, Gujarat
```

The internal invoice ID is based on the existing order ID. Payment/status details reflect the current saved order when downloaded.

## Update on Windows

1. Extract this ZIP into a fresh folder. Copy your existing `server/.env` and product uploads. Keep the existing MongoDB connection/data; do not reset or reseed an existing installation.
2. Run INSTALL_WINDOWS.bat. This installs `pdfkit` and `qrcode`, along with the frontend dependencies.
3. Add the real receiving UPI configuration described above.
4. Start `npm run dev` inside server and inside client in separate terminals.
5. Open the Vite URL. Signed-out visitors still start at Login.

## Code

- `server/services/payments.js`: validated receiving account configuration and QR generation.
- `server/routes/admin.js`: admin-only payment setup diagnostics.
- `client/src/payment-status.jsx`: admin setup status and instructions.
- `server/services/invoice.js`: invoice PDF generation and pagination.
- `server/assets`: copied logos and licensed embedded fonts for invoice rendering.
- `server/routes/orders.js`: authenticated invoice download.
- `client/src/invoice.jsx`: download button, loading and retry errors.

## Checks

26 backend model-double/PDF tests passed. Client production build passed. Mocked browser checks passed for customer/admin PDF downloads in English/Gujarati, disabled/enabled QR diagnostics, QR checkout, account isolation, admin management and mobile layouts. Actual PDF samples were generated, text-checked and visually inspected in both languages, including a 70-item paginated order. Real MongoDB and bank transfers were not exercised.
