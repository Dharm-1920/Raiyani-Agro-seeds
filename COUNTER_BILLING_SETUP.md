# Admin counter billing

Open **Admin → Counter bills** to make a bill for a walk-in customer. The customer does not need a website account.

1. Enter the customer name and, if needed, phone number and address.
2. Type item names or search the catalogue to copy a name, unit and starting rate. Enter the selling price for this sale manually. Quantities support three decimal places, prices support two, and an optional flat rupee discount is applied to the total. Each line rounds to the nearest paise before the total is calculated.
3. Choose cash, UPI or card and whether payment has actually been received. UPI here records a counter payment; it does not generate a checkout QR or verify a bank transfer.
4. Choose English or Gujarati. Catalogue Gujarati names are copied; custom items can have a manually entered Gujarati name.
5. Check **Customer requests this bill on WhatsApp** only when the customer requests it, and enter their WhatsApp number.
6. Save the bill. Use **Print bill** to open the browser's printer dialog and choose the connected printer. The print layout uses A4 paper, repeats the item headings across pages, and excludes admin controls and bill history. **Download PDF** saves the server-generated bill instead.

Saved bills have a stable `CS-` reference and remain available in paginated counter bill history. Saving again with the same request key returns the existing bill; the server refuses a changed bill under that key. Browser drafts are remembered for the signed-in administrator in the current tab. Saved sale lines and totals are immutable; later payments are appended to the same bill.

Counter bills use a separate collection from online orders. Copying a catalogue item does not change its website price or reduce its stock. Counter sales are not included in the existing online-order dashboard revenue. Use counter bill history to review these sales.

## WhatsApp

Automatic PDF delivery reuses the existing approved Twilio WhatsApp document template and the persistent delivery worker. Configure the business-owned sender, template, credentials and public HTTPS `APP_URL` as described in [login and invoice setup](LOGIN_AND_INVOICE_SETUP.md). These settings are server secrets. No paid service is activated by this feature.

After a requested bill is saved, its WhatsApp job is queued once. The worker retries failures, including bills left unqueued by a temporary outage. **Check sending status** distinguishes queued, sending, accepted and failed states. Accepted means the provider accepted the message; it does not prove that the customer received or read it.

**Share on WhatsApp** also works without the automatic provider. On the public HTTPS website it prepares the customer's WhatsApp chat with a private PDF link that expires in seven days. The administrator clicks **Open customer WhatsApp** and sends the message. Anyone holding that link can open that specific bill without a website account. On local HTTP development, the app downloads the PDF for manual attachment instead of sending an inaccessible localhost link; supported phones can use their file-sharing sheet.

WhatsApp requests use the saved customer number, never the administrator's number or email. All bill creation, history, PDF and sharing actions require administrator authentication. Shared PDF links require a valid expiring token, a matching saved delivery job and the bill's WhatsApp permission.

## Validation

Backend tests cover prices, fractional quantities, discounts, invalid input, simultaneous save retries, admin-only access, real PDF generation, queue failures, counter-specific delivery and shared-link permissions. Browser checks use mocked API responses to exercise the form, WhatsApp recipient, unavailable-provider status, print action and print-only layout, Gujarati UI and mobile widths. Real database persistence, a physical printer and live WhatsApp receipt still require checks with the shop's connected services.
