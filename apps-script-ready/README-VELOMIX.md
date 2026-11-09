# VeloMix storefront adaptation for Google Apps Script

This branch adapts the layout and styles of [VeloMix by FreeTemplateGo](https://github.com/making530/free-fashion-store-website-template) for the existing Brand Store Google Apps Script + Google Sheets system.

**License:** the template's FreeTemplateGo License permits modification and commercial use, but requires the footer attribution **Template by FreeTemplateGo**. It remains in `IndexV2.html`. Do not remove the attribution, redistribute the original template as-is, or claim the original design as your own.

## Install (existing Google Apps Script project)
1. Save a backup copy of your current `Index.html` first.
2. From this branch, copy `apps-script-ready/IndexV2.html` in full and paste it into your Apps Script `Index.html` (keep that exact name).
3. If you have not yet installed the Website Editor, use `Code.gs`, `Admin.html` and `appsscript.json` from **this branch** too, after backing them up.
4. Save. Open the project's **/dev** test deployment (requires editor access) and check the storefront.
5. Do not update **/exec** until the tests below are complete.

## Photos, descriptions and products
- `Website Editor` lets you upload the main Hero photo or set its public HTTPS URL. The display also falls back to a product photo from Sheets.
- The product cards and prices are read from `getCatalog` (Products, Variants in Google Sheets). At present the store backend exposes a single active product with color variations, rather than a full multi-product catalog.
- Product photos/price/color/size/material/description are controlled from the original Google Sheets catalog. No sample coupon promises, fake reviews, fake shipping guarantees or localStorage cart are present.
- The existing Checkout, order idempotency, launch readiness checks, capacity limits and admin workflow are preserved from the project source.

## What is adapted vs original
- VeloMix header/nav, split hero, orange CTA, typography, large title, product cards, and responsive styles are used; styles are scoped to the VeloMix page sections to avoid overriding the functional checkout.
- New product cards route directly to the real `#order` form.
- The original multipage `shop.html`, `blog.html`, etc. and simulated wishlist/cart/newsletter are not included; the Google Apps Script deployment serves one real storefront plus its separate Admin page.

## Tests to run before launching
- Confirm the VeloMix homepage renders on laptop and mobile and that menu links open working sections.
- Add a public hero image in Website Editor, save, and verify it appears from an incognito browser. Confirm sharing policy permits public images.
- Confirm the product cards show the real product and variant prices from Sheets.
- Change a color, size, quantity and governorate; check totals and shipping, then place a **demo order** and verify it appears once in Admin.
- Test an unknown/unauthorized Google account cannot access Admin, and that a repeat submission doesn't create a duplicate order.
- Check demo/launch notices and checkout restrictions remain visible and functional.

**Status:** JavaScript syntax and known ID references were checked. A live browser run, Google API integration test and customer-facing production deployment have not been performed in this conversation.
