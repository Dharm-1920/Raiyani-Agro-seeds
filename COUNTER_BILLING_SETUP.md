# Admin counter billing

Open **Admin → Counter bills** to make a bill for a walk-in customer. The customer does not need a website account.

1. Tap product cards in **Products & bill items**. These are the same active products you add under **Products** for online shopping. Browse categories, search by English or Gujarati name and use the page controls to reach the full catalogue. Refresh fetches current stock; the screen also refreshes every 30 seconds while visible and when the window regains focus.
2. Tapping again increases the selected quantity. Use the current bill's plus/minus controls or enter a quantity, and change the selling price for this sale if needed. **+ Manual item** adds an unlinked item. Quantities support three decimal places, prices support two, and an optional flat rupee discount is applied to the total. Each line rounds to the nearest paise before the total is calculated. Continue to customer details to select a saved customer or enter their name, optional phone and address.
3. Choose cash, UPI or card and whether payment has actually been received. UPI here records a counter payment; it does not generate a checkout QR or verify a bank transfer.
4. Choose English or Gujarati. Catalogue Gujarati names are copied; custom items can have a manually entered Gujarati name.
5. Check **Customer requests this bill on WhatsApp** only when the customer requests it, and enter their WhatsApp number.
6. Save the bill. Use **Print bill** to open the browser's printer dialog and choose the connected printer. The print layout uses A4 paper, repeats the item headings across pages, and excludes admin controls and bill history. **Download PDF** saves the server-generated bill instead.

Saved bills have a stable `CS-` reference and remain available in paginated counter bill history. Saving again with the same request key returns the existing bill; the server refuses a changed bill under that key. Browser drafts are remembered for the signed-in administrator in the current tab. Saved sale lines and totals are immutable; later payments are appended to the same bill.

Counter bills use a separate collection from online orders, while catalogue items share the **same Product stock**. Saving a bill deducts linked quantities immediately, including for pay-later sales. Adding/removing draft items has no stock effect. Changing a counter rate does not change the website price. Manual items never change catalogue stock. Existing bills and older unlinked drafts are not matched by name or deducted retroactively; remove an old copied line and select its product card to link it before saving.

Linked product IDs are validated, duplicate product lines are aggregated, and names/units are snapshotted from the database at save time. Archived, hidden, missing and insufficient-stock products are refused. The bill and all linked deductions use one MongoDB transaction: if any item fails, all changes roll back. Exact retries return the saved bill without another deduction, even after a product is archived. Concurrent sales compete for the same stock, including the existing online checkout's conditional deductions. Product-card availability is a snapshot; the save performs the final check.

Stock-linked counter bills require a transaction-capable MongoDB replica set (including the existing Atlas deployment) or sharded cluster. A standalone local MongoDB cannot save linked-stock bills; the server refuses the save safely instead of making partial changes. Manual-only bills still work without a transaction. Payments recorded later never deduct stock again. Counter bill returns/cancellation are not included. Counter sales remain in counter history and bookkeeping, outside the online-order dashboard revenue.

## WhatsApp

Automatic PDF delivery reuses the existing approved Twilio WhatsApp document template and the persistent delivery worker. Configure the business-owned sender, template, credentials and public HTTPS `APP_URL` as described in [login and invoice setup](LOGIN_AND_INVOICE_SETUP.md). These settings are server secrets. No paid service is activated by this feature.

After a requested bill is saved, its WhatsApp job is queued once. The worker retries failures, including bills left unqueued by a temporary outage. **Check sending status** distinguishes queued, sending, accepted and failed states. Accepted means the provider accepted the message; it does not prove that the customer received or read it.

**Share on WhatsApp** also works without the automatic provider. On the public HTTPS website it prepares the customer's WhatsApp chat with a private PDF link that expires in seven days. The administrator clicks **Open customer WhatsApp** and sends the message. Anyone holding that link can open that specific bill without a website account. On local HTTP development, the app downloads the PDF for manual attachment instead of sending an inaccessible localhost link; supported phones can use their file-sharing sheet.

WhatsApp requests use the saved customer number, never the administrator's number or email. All bill creation, history, PDF and sharing actions require administrator authentication. Shared PDF links require a valid expiring token, a matching saved delivery job and the bill's WhatsApp permission.

## Validation

Backend tests cover prices, fractional quantities, discounts, invalid input, simultaneous save retries, linked stock aggregation, transaction rollback, competing sales, unavailable products, admin-only access, real PDF generation, queue failures, counter-specific delivery and shared-link permissions. Browser checks exercise the product cards, categories, paging, manual rates, quantities, saved-customer flow, Gujarati UI and mobile widths. Tests do not create real shop sales or send messages. A physical printer and live WhatsApp receipt require the shop's connected services.
