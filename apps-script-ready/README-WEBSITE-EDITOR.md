# Website Editor — V1 (trial branch)

This feature is on `feature/website-editor-v1`. No production deployment was changed.

## Files to update in your existing Apps Script project

1. Copy `apps-script-ready/Code.gs` into the existing `Code.gs`.
2. Copy `apps-script-ready/Admin.html` into `Admin.html`.
3. Copy `apps-script-ready/IndexV2.html` into `Index.html` (the router uses `Index`).
4. Copy `apps-script-ready/appsscript.json` into the manifest.

**Back up the four old files first.** Do not run `setupStore` again just for appearance changes. No sheet schema migration is necessary. The first editor save creates `appearance_*` rows in the existing Settings tab.

## Publishing / permissions

Keep two deployments with the **existing** separate permissions:

- Storefront: execute as owner, public access only when ready.
- Admin: execute as *user accessing the web app*. The server rejects missing email identity and non-allowlisted users.

The new photo-upload feature requires the **Google Drive OAuth scope** (see manifest). Google may ask you to authorize the updated scopes. Uploads create files in a dedicated folder named `Brand Store — PUBLIC website photos` and set each image to **anyone with the link can view**. Never upload a personal photo or customer information. If your Google account forbids public sharing, the upload returns a clear error. Google Drive image delivery is not a guaranteed CDN; for reliable long-term public images, use a proper image hosting/CDN provider and paste an HTTPS URL.

For the best quality, use compressed JPG/PNG/WebP under **2 MB** and check the public image from a signed-out browser. Uploading does not auto-publish: click **Save & publish appearance** afterward.

## What is editable

- Homepage headline, kicker, button text
- Editorial / Minimal / Dark theme
- Scroll animation (reveal, parallax, off)
- Hero image URL or upload
- Collection label, footer note, optional announcement

`editorial_image_url` is saved for a future editorial section; it is not used by the current V1 display. Product gallery photos, prices, material, variants and shipping remain controlled by their Sheets tabs. Brand name, brand description, policies and contact details remain in **Launch Settings**.

## Testing

1. Check the admin view as an allowlisted Google user.
2. Change headline/theme, verify the preview, save, and load the storefront with a refresh.
3. Upload a sample publicly shareable photo, save, and test from an unsigned-in browser.
4. Verify the sample product/color/size selections and submit one **demo** order. Verify that exactly one new demo order appears in the admin view.
5. Verify rejected admin access from an unauthorized Google account.
6. Test the storefront on mobile with **Reduce Motion** enabled.
7. Confirm launch/demo notices still appear. Do not open live orders until the original launch readiness checklist passes.

This work has not been deployed or tested against your live Google Sheet or actual Apps Script deployment.
