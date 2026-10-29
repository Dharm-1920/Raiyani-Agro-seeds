# Saved counter customers and account book

## Save a customer once

On **Admin → Counter bills**, **Save this customer for future visits when saving the bill** is checked for a new customer. Enter their name, optional phone and address, then save the bill. The customer profile is saved and the bill is linked to it. Uncheck this option for a one-off walk-in bill.

On the next visit, use **Returning customer? Search name or phone**. Select the result to fill their name, phone, address and preferred bill language. You can also open **Admin → Counter customers → Make bill**. Product lines and prices remain specific to the new sale. Invoice and reminder WhatsApp permissions are chosen separately for each bill, not copied automatically from a previous visit.

The directory also lets you add a customer without a bill, edit their details and open their account statement. Phone numbers are normalized and a saved phone number cannot be used for a second profile. If a number already exists, select the existing customer. Names alone are not used as identifiers: two customers may have the same name, and customers without phone numbers have separate saved IDs.

Saved customer fields on a bill are read-only. Edit the directory profile and select it again to use updated details. Each saved bill keeps its original customer details. Editing a profile does not rewrite old invoices, change old reminder recipients or alter old sales. The server refuses a new bill with stale saved-customer details and asks you to select the updated profile again. An exact retry of a previously saved bill remains safe after a profile edit.

**Customer account statement** lists the customer's linked bills and payments across visits, with debits, credits, opening balance, running balance and closing balance. Date filters use India time. Earlier transactions carry forward into the opening balance. Current dues show unpaid balances across all dates. CSV export includes the complete filtered statement, beyond the current page. Earlier unlinked bills are not silently combined by matching a name or phone.

Customer directory and statement endpoints are administrator-only and send `private, no-store` cache headers. These profiles do not create website logins or passwords. Profile creation uses a unique request key; retries do not create a second profile. Version checks prevent an administrator from overwriting another administrator's recent edit.

## Account book

**Admin → Account book** provides two views:

- **Account ledger**: choose Cash, Bank / UPI, Card clearing, Customer receivables, Counter sales, owner funds, loan, opening balance or an expense account. See opening balance, dated debit/credit entries, running balances and closing balance.
- **Day book**: dated transactions across all accounts, showing the voucher/bill, description, debit account, credit account and amount.

Counter bills, their payment history and recorded expenses appear automatically. Opening balances include recorded entries before the chosen start date. Balances show **Dr** or **Cr**; the account book is based on recorded entries and does not claim to match an external bank statement. Export the entire filtered ledger or day book as CSV.

Use **Add an accounting entry** for an opening balance, cash/bank transfer, owner deposit/drawing, loan or other adjustment. Each entry has a date, description, distinct debit and credit accounts and one amount, so both sides balance. For example, opening cash debits Cash and credits Opening balance equity; a cash deposit to the bank debits Bank / UPI and credits Cash.

Customer receivables and counter sales cannot be manually posted here: use bills and their payment records so individual customer dues stay consistent. Ordinary paid expenses should be entered once through **Bookkeeping → Record a paid expense**. Manual journal entries do not change the existing counter-sales summary cards; they appear in the account book. Do not record the same transaction in both places.

Saved accounting entries are permanent. A correction is a separate reversing entry, retaining the original history. Unique request keys protect repeated and concurrent saves, and a changed entry under the same key is refused. User-facing drafts are retained in the administrator's current browser tab.

This adds an operational account book to the existing counter-sales bookkeeping. Website orders, GST calculations, inventory valuation, supplier purchase automation, bank reconciliation and accounting period locks are not included.

## Validation

Backend tests cover saved-customer search and privacy, duplicate phones, retry-safe creation, version conflicts, repeat bill links, unchanged historic bill details, separate customers with identical names, customer statement balances, manual entry validation, ledger opening/running balances, account-book permissions, transfer retries and private CSV exports. Browser checks use temporary sample data; they do not create real customer records or send WhatsApp messages.
