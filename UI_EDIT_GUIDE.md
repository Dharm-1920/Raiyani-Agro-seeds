## Languages and logos

Use `client/src/language.jsx` and `client/src/gu.json` for English/Gujarati selection and translation. Logo files are `client/public/assets/logo-en.png` and `logo-gu.png`. See **LANGUAGE_AND_LOGO_SETUP.md**.

# Where to edit the website UI

The current look is the **"Harvest" theme** in **client/src/theme.css** (loaded last, customer pages only): deep leaf green, white cards with soft shadows, harvest-gold highlights and the Plus Jakarta Sans font (self-hosted in `client/public/assets/fonts/` with its licence). Change its colours in the first block of that file. Underneath it are **client/src/refined.css** and **client/src/polish.css**, the older design layers; they are loaded after the base stylesheet, `style.css`, so their rules override matching base rules. Two newer files are loaded last (see `main.jsx`):

- **client/src/shop-ui.css**: the checkout steps, payment cards, order tracker, UPI payment panel, phone bottom dock and purchase bar, in the same green and parchment style.
- **client/src/interactions.css** with **client/src/interactions.jsx**: how the shop *feels* to use (see "Interactions" below).

`App.jsx` sets a `data-fx` attribute on `<html>` on customer pages only, so these interactions never affect admin screens. Visitors who choose "reduce motion" on their phone or computer see no animations.

| File | Edit here for |
| --- | --- |
| client/src/refined.css and client/src/polish.css | Colours, fonts, spacing, card appearance, hero background, mobile layouts |
| client/src/shop-ui.css | Checkout, payment choice, orders, UPI panel, phone dock and purchase bar styling |
| client/src/interactions.jsx and client/src/interactions.css | Scroll effects, smart header, back-to-top, add-to-cart message, ripples, number counting |
| client/src/shop-ui.jsx | Phone bottom dock, Cart → Delivery → Payment → Done steps, order progress tracker, payment status labels, copy button |
| client/src/shop-ui-gu.json | Gujarati text for the parts above |
| client/src/purchase.jsx | Quantity control, Add to cart / Buy now, and the fly-to-cart animation |
| client/src/style.css | Base form, layout and shared component styling |
| client/src/pages.jsx | Homepage, category sections, product cards, shop, cart, checkout, orders, login and contact content |
| client/src/App.jsx | Header, search form, navigation, footer and page routes |
| client/src/ProductArt.jsx | Category and placeholder product illustrations |
| client/src/admin.jsx | Admin sign-in, sidebar, dashboard and management screens |
| client/src/admin.css | Admin page styling and mobile layout |
| client/src/auth.jsx and client/src/auth.css | Customer login/signup choices, password recovery, email verification and account security |
| client/src/invoice.jsx | Invoice downloads, WhatsApp sharing and delivery status |
| client/src/config.js | Shop name, phone, address area, map and opening hours |
| client/public/assets/farm-sunrise.webp | Hero photograph |

## Change colours

At the beginning of `polish.css`, change these variables:

```css
:root {
  --g: #234b36;   /* main green */
  --gd: #173b29;  /* darker green */
  --bg: #f7f5ed;  /* page background */
  --t: #253c2d;   /* text */
}
```

Some sections use their own colours, such as `.nav`, `.hero .btn`, and `.foot`. Change those selectors too if you want an entirely different palette.

## Interactions

- **Scrolling:** sections, product cards and story cards glide in as they come into view (`ScrollReveal`; the list of what animates is `REVEAL` in `interactions.jsx`). A thin progress line at the top shows how far down the page you are. The header tucks away while scrolling down and slides back when scrolling up. A back-to-top button appears on long pages. The cover photo drifts slightly slower than the page.
- **Selecting:** the shop's category chips have a highlight that slides to the chosen one. Choosing a payment method pops a check mark onto that card. The quantity number rolls up or down when + or − is pressed. Buttons show a ripple from the exact point you press.
- **Adding to cart:** the product's picture flies into the cart (the bottom dock on phones, the floating cart button on larger screens), the cart badge bumps, phones give a short vibration, and an "Added to cart · View cart" message slides up so new customers know the next step. Cart totals count smoothly to their new value, and unlocking free delivery gives a small celebration.

## Checkout and payment flow

- **Cart and checkout** show a 4-step progress bar (Cart → Delivery → Payment → Done). On phones, a bar pinned to the bottom always shows the total and the main button. If there is no delivery address yet, that button changes to "Add delivery address" and scrolls to the address section.
- **Payment choice** cards explain what happens next. UPI is greyed out with the reason when `SHOP_UPI_ID` is not set on the server.
- **UPI payment panel** (`payment.jsx`): 1) pay with the "Pay with UPI app" button or scan the QR (on phones the button comes first), with a copy button for the UPI ID; 2) enter the 12-digit UTR (pasted spaces and words are removed automatically, with a "Where do I find the UTR?" help); 3) the shop confirms after checking its bank account.
- **My orders** shows each order's progress (Placed → Confirmed → Shipped → Delivered), a plain payment status, and a "Pay now" button for unpaid UPI orders.

## Change the homepage heading

In `pages.jsx`, find `export function Home()` and edit the `<h1>` inside the section with `className="hero"`.

## Change the hero photo

The homepage and cover photo is `client/public/assets/farm-sunrise.webp` (used in `pages.jsx` and `business.jsx`). Files under `/assets` are cached by browsers for a year, so give a new photo a **new file name** and update those two references, instead of overwriting the old file.

## Add actual product photos

Log in as admin and open Admin > Products. Upload photos when adding or editing a product. Products without photos show a labelled category illustration.

## See changes locally

On Windows, double-click **START_UI.bat** in the extracted project folder. It installs frontend dependencies if needed and opens the Vite website.

Alternatively, open a terminal in the project folder:

```bash
cd client
npm install
npm run dev
```

Open the localhost URL printed by Vite. Save an edited file to see the changes automatically. Keep the Node API and MongoDB running to see your products and use login/checkout.

## Farm image provenance

The farm hero is an AI-generated illustrative scene, not a photograph of the shop. It was created with the built-in image-generation tool using this prompt:

“Create a premium editorial landscape photograph of lush cultivated farm fields in Gujarat at golden sunrise. Parallel planted crop rows curving toward the horizon, a few trees far away, rich emerald foliage, warm amber sunlight and soft morning mist. Wide landscape composition, darker low-detail foliage on the left for white website text, sunlit rows and green leaves on the right. No text, logos, people or buildings.”
