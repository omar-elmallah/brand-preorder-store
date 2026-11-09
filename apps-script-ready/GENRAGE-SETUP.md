# GENRAGE homepage V2 — install and test

This branch builds on `feature/website-editor-v1`. It does **not** change the live Google Apps Script deployment automatically.

## Apply to existing Apps Script project
Back up current project files, then paste these replacements:
1. `apps-script-ready/Code.gs` into `Code.gs`.
2. `apps-script-ready/Admin.html` into `Admin.html`.
3. `apps-script-ready/IndexV2.html` into `Index.html` (the server routes to `Index`).
4. `apps-script-ready/appsscript.json` into the manifest, if not already updated for the editor.

Keep your existing Sheets spreadsheet. Do not create a new database or run the initializer just for this UI update.

## Supply the actual model photo
The uploaded fashion photograph is **not embedded into GitHub or a hosted URL**. In your authorized Admin deployment open **Website Editor**, choose the image file (prefer transparent PNG to allow the giant word to show behind the model), click **Upload center image**, then click **Save & publish appearance**. The default giant background word is `GENRAGE`. You can upload a separate thumbnail using **Use selected image as thumbnail** or reuse the center image automatically.

The input image from chat was cropped below the waist. It can be layered unchanged in identity and clothing, but it cannot become a full-body photo without generating imagery outside the original photo. A transparent cutout version of the original photograph was prepared in chat for manual upload.

## Preview and release
Test the storefront with Apps Script's `/dev` deployment, verify the image in a signed-out browser, check mobile layout and reduced-motion mode, and submit one demo order to confirm it appears once in Admin. The existing server and order processing remain in place, but this branch was not end-to-end deployed/tested in your Google account. Update the production `/exec` deployment only after validation.

Image uploads become link-public on Google Drive and require Drive OAuth authorization. Only publish images you have permission to use. Image delivery through Google Drive may be unreliable as a long-term website CDN; move them to dedicated public hosting for production if necessary.

## Visual direction
Off-white #F3F3F1, black #111111, bold sans large word, serif editorial body copy, five small navigation links, central photo, bottom-left copy/CTA, bottom-right thumbnail. The commerce sections continue below the hero and use the existing Sheets product data.
