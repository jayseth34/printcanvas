# PrintCanvas

A static, browser-based design studio for preparing artwork on T-shirt mockups, styled for the Dawn Sogni brand. Uploaded artwork stays in your browser; the site does not upload images to a server.

## Run locally

Open `index.html` in a modern browser. No build step or account is required. Google Fonts and PDF export need an internet connection.

## Features

- Upload multiple browser-supported images, including PNG, JPG, and WebP, as individually selectable layers.
- Add editable text layers with live Google Fonts preview, text color, and size controls.
- Preview on regular-fit and oversized T-shirt mockups in 14 shirt colors.
- Sample a solid background color and remove it with adjustable tolerance.
- Select, drag, resize, rotate, adjust, and remove each artwork layer independently.
- Click empty canvas space to deselect the active layer.
- Adjust brightness, contrast, sharpness, scale, rotation, and placement per selected layer.
- Export a JPG mockup, transparent PNG artwork, or PDF proof.

PDF export loads jsPDF from a CDN and requires an internet connection. Background cleanup and image adjustments run in the browser; they are not AI cutout or generative upscaling.



## Dawn Sogni edition
- **Look:** dark Dawn Sogni theme (`theme.css`), with the logo and a link back to the shop.
- **Crop:** select an image layer, then press **Crop image**. You can crop freely or lock to 1:1, 4:5, 3:4, 16:9 or the original ratio. Drag the box or its handles, or nudge it with the arrow keys.
- **Fonts:** 85 free fonts are stored in `fonts/` and listed in `fonts.js`, grouped as Gothic, Streetwear, Futuristic, Script, Serif and Sans. They're searchable and each one loads only when it's used. You can also upload your own font (.ttf, .otf or .woff). All the bundled fonts are under the SIL Open Font License or Apache 2.0, from Google Fonts via Fontsource.
- **Order:** "Order this design on WhatsApp" saves a preview, then opens a chat with Dawn Sogni.
