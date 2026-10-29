# Pay later, payment reminders and bookkeeping

## Credit sales and payments

In **Admin → Counter bills**, choose **Pay later (credit)**. The bill is saved with nothing received and its full amount outstanding. A cash, UPI or card bill may also be marked **Pay later** in the payment status field. There is no bank verification or automatic charge.

Open the saved bill to **Record a payment**. Enter only money actually received, its method and an optional note. Part payments reduce the remaining balance. The final payment marks the bill paid and switches reminders off. The printed bill and PDF show the total, received amount and remaining balance; the payment history lists individual receipts.

Receipt amounts are validated in paise. Overpayments are refused. An atomic version check protects competing payments, and reusing a receipt request key returns the same receipt. A changed amount under that key is refused. Draft receipt and expense keys survive a refresh in the same browser tab. Existing paid bills are treated as initially paid; existing pending bills retain their full balance without a database reset.

## Every-15-day WhatsApp reminders

Record the customer's valid phone number and their agreement using **Customer agrees to WhatsApp payment reminders every 15 days**. Agreement is separate from the one-time invoice WhatsApp request. You can also switch reminders on or off on a saved unpaid bill.

The first reminder is due 15 days after saving or enabling reminders. After a reminder is accepted by the provider, the next is scheduled 15 days later. The worker rechecks the saved balance and permission before each send, so a part payment changes the next reminder's amount and full payment stops future sends. Missed reminders during downtime do not create a burst of historical messages. The server checks due reminders every minute while running. A sleeping or stopped server cannot send at the scheduled time; it resumes processing when running again.

Automatic reminders use a **separate approved WhatsApp template** from the invoice document template:

```dotenv
TWILIO_ACCOUNT_SID=YOUR_ACCOUNT_SID
TWILIO_AUTH_TOKEN=YOUR_PRIVATE_TOKEN
TWILIO_WHATSAPP_FROM=YOUR_APPROVED_SENDER
TWILIO_WHATSAPP_REMINDER_CONTENT_SID=YOUR_APPROVED_REMINDER_TEMPLATE_SID
```

The reminder template variables are `1=customer name`, `2=CS-bill reference`, `3=remaining amount including INR`. Example body to submit for approval: `Hello {{1}}, {{3}} remains due on your Raiyani Agro Seeds bill {{2}}. Please contact the shop to arrange payment. If you have already paid, please let us know. Thank you.` Configure the sender and template with the business account; no paid provider or template is activated by these code changes. See [Twilio's template guide](https://www.twilio.com/docs/whatsapp/tutorial/send-whatsapp-notification-messages-templates).

Without this configuration, jobs remain queued and the screen reports that automatic reminders are unavailable. **Prepare WhatsApp reminder** opens a manual message for the customer with the current balance; the administrator sends it in WhatsApp. Preparing a manual message does not advance the automatic schedule because the website cannot verify whether it was sent.

Reminder jobs are durable and unique per bill and scheduled cycle. The worker claims jobs with a lease and retries temporary failures, up to six attempts per cycle, then schedules another cycle 15 days later. An expired final lease is recovered instead of remaining stuck. Provider acceptance means the provider accepted a message, not that the customer received or read it. A message already handed to the provider can still arrive after a later payment; an ambiguous provider timeout may result in a retry. No reminder is treated as a payment or changes the balance.

## Bookkeeping

**Admin → Bookkeeping** includes counter sales and paid expenses. Website orders remain in their existing dashboard and are not included here.

- A counter sale is recorded once: debit **Customer receivables**, credit **Counter sales**, for the net bill total after discount.
- Each actual customer payment is separate: debit **Cash**, **Bank / UPI** or **Card clearing**, credit **Customer receivables**. It does not add sales revenue again.
- A paid expense debits the selected expense category and credits **Cash** or **Bank / UPI**. Entries have a payee, description, date, administrator and stable request key.

The journal is derived from the saved sale, embedded receipt history and expense records, so it cannot lose an accounting entry through a failed second write. Receipts and expenses cannot be edited or deleted from this UI. All functions require administrator authentication.

Date filters include entire days in **Asia/Kolkata**. Sales, receipts, expenses and account movements use the selected period. Customer dues always show current outstanding balances across all dates, including earlier unpaid bills. Use **Record payment / open bill** to return to the correct bill. Export the complete filtered journal as CSV; exports include all matching rows, not just the visible page. Spreadsheet formula-like text is neutralized.

**Receipts less expenses** is cash movement from these recorded transactions. This feature does not calculate profit, opening bank balances, inventory purchase costs, stock valuation, GST, bank settlement or tax returns. Card receipts are held in **Card clearing** because a recorded card payment does not prove bank settlement. Catalogue-linked counter bills reduce shared online stock at sale time; later payments only update the receivable and receipt accounts.

## Validation

Tests cover concurrent and repeated receipts, overpayment rejection, legacy bills, initial credit sales, balanced accounting entries, date boundaries, expense retries, safe CSV exports, administrator access, reminder timing, partial/full payments, missing configuration, retries and worker recovery. Browser checks use sample API data. Live WhatsApp receipt and production database persistence require the connected shop services; tests do not send real messages or create real sales.
