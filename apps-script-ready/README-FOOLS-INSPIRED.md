# FOOLS-inspired fashion storefront for Brand Preorder Store

This is an original design inspired by the *layout conventions* of [fools-eg.com](https://fools-eg.com/), adapted to your brand and the existing Google Apps Script + Google Sheets system. It does not include source code, logo, photos, text or other proprietary assets from the referenced brand.

The homepage features a slim announcement bar, minimalist central wordmark, campaign-photo Hero, marquee, dynamic New Arrivals cards, editorial feature and the existing product details, delivery form and policy sections.

## Copy and paste into your existing Apps Script project

1. Back up all four existing files before replacing anything.
2. **If you already installed Website Editor V1:** replace only the contents of `Index.html` with the entire contents of `apps-script-ready/IndexV2.html` from this branch. For consistent new default visual labels, optionally update `Code.gs` as well.
3. **If you have not installed Website Editor V1:** copy `Code.gs`, `Admin.html`, and `appsscript.json` from this same branch into their corresponding Apps Script files, plus `IndexV2.html` into `Index.html`. Keep the name `Index` in Apps Script, because `doGet` looks for it.
4. Save and test the `/dev` URL as a script editor before editing the production `/exec` deployment.

Do **not** run `setupStore` again solely to install this visual redesign, and do not change your existing Google Sheet ID. No database schema migration is required.

## Uploading your own images

- Open your authorized admin deployment with `?admin=1`, then **Website Editor**.
- Choose a JPG, PNG or WebP campaign photo (under 2 MB), click **Upload center image**, then **Save & publish appearance**.
- Product gallery images still come from `Products.image_urls` in Google Sheets as a JSON array of public HTTPS image URLs, for example `["https://your-image-host.com/product-front.jpg", "https://your-image-host.com/product-back.jpg"]`.
- `editorial_image_url` from Website Editor sets the secondary image section on this layout.
- Upload images you own or have permission to use. Do not upload private materials or customer data. Drive-hosted image delivery requires public sharing permissions and should be tested from an unsigned-in browser. Dedicated image hosting/CDN is more reliable for production.

## Important functional scope

The backend currently returns **one active product** and its color/size variants. The New Arrivals grid shows those color variants, with available variant prices from Google Sheets, and all Buy links go to the functioning existing `#order` form. It does *not* claim to include Shopify's full multi-product cart. No dummy checkout, fake sale labels, fake stock numbers, or fictional testimonials are added.

The original checkout features — demo mode, checkout tokens, idempotency, shipping calculations, order protection, and admin authorization — remain in the code. They still need real end-to-end tests.

## QA checklist

1. In `/dev`, check the new header, Hero, marquee, products and checkout on desktop and mobile.
2. Save an image URL or upload in Website Editor, reload the storefront and verify the actual public image appears.
3. Select color, size, governorate and quantity, and verify the checkout total is correct.
4. Place a demo order and verify it appears **once** in the existing admin dashboard.
5. Verify denied access from unauthorized admin accounts.
6. Verify that the signed-out storefront displays images and respects reduced-motion preference.
7. Deploy a new `/exec` version only after the checks pass.

**Validation status:** JavaScript syntax and referenced DOM IDs were checked from the repository files. The user's live Google Apps Script deployment, actual Sheets data and browser appearance have not been tested in this environment.
