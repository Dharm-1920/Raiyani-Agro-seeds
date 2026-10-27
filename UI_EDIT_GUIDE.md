## Languages and logos

Use `client/src/language.jsx` and `client/src/gu.json` for English/Gujarati selection and translation. Logo files are `client/public/assets/logo-en.png` and `logo-gu.png`. See **LANGUAGE_AND_LOGO_SETUP.md**.

# Where to edit the website UI

Start with **client/src/refined.css**. This contains the premium design and is loaded after the base stylesheet, `style.css`, so its rules override matching base rules.

| File | Edit here for |
| --- | --- |
| client/src/refined.css | Colours, fonts, spacing, card appearance, hero background, mobile layouts |
| client/src/style.css | Base form, layout and shared component styling |
| client/src/pages.jsx | Homepage, category sections, product cards, shop, cart, checkout, orders, login and contact content |
| client/src/App.jsx | Header, search form, navigation, footer and page routes |
| client/src/ProductArt.jsx | Category and placeholder product illustrations |
| client/src/admin.jsx | Admin sign-in, sidebar, dashboard and management screens |
| client/src/admin.css | Admin page styling and mobile layout |
| client/src/config.js | Shop name, phone, address area, map and opening hours |
| client/public/assets/farm-sunrise.png | Hero photograph |

## Change colours

At the beginning of `refined.css`, change these variables:

```css
:root {
  --g: #214b32;   /* main green */
  --gd: #153722;  /* darker green */
  --bg: #f9f8f2;  /* page background */
  --t: #24392a;   /* text */
}
```

Some sections use their own colours, such as `.nav`, `.hero .btn`, and `.foot`. Change those selectors too if you want an entirely different palette.

## Change the homepage heading

In `pages.jsx`, find `export function Home()` and edit the `<h1>` inside the section with `className="hero"`.

## Change the hero photo

Replace `client/public/assets/farm-sunrise.png`, or place a new photo in the assets folder and update the URL inside `.hero` in `refined.css`. There is also a mobile `.hero` background rule inside the media query.

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
