# Product removal update

## Install in your existing project

Keep your existing `server/.env` and MongoDB database. Replace these files from the updated project:

- `client/src/admin.jsx`
- `server/models.js`
- `server/routes/products.js`
- `server/routes/orders.js`

The included `client/vite.config.js` also uses `127.0.0.1:5000`, matching your local proxy fix.

Restart the server and Vite in their separate terminals:

```powershell
# In server
npm run dev
```

```powershell
# In client
npm run dev
```

No seed command or password reset is needed for this update.

## Use

Open Admin > Products. Each product row now has Edit, Hide/Show and Remove buttons. Remove asks you to confirm, then removes the product from the admin catalogue and storefront. If you were editing that product, the editor is cleared. An error message appears if removal fails.

Hide/Show remains available for products you want to temporarily take off sale. Remove archives the product record with `isDeleted: true` and `isActive: false`; it preserves existing order references and does not delete order history or invoices. Removed products cannot be fetched by their storefront URL, purchased or reactivated through the product-edit API. Existing products work without a database migration.

Verification: production build passed; browser checks with simulated API responses covered confirmation, cancellation, removal from the list and clearing an active editor. API checks with model stubs covered admin-only removal, archived product access, invalid/missing IDs and blocked reactivation. Real MongoDB persistence still requires your local services.
