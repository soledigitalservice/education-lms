# PWA icons

Drop two PNGs in this folder for the PWA to be installable:

- `icon-192.png` — 192×192, transparent background recommended
- `icon-512.png` — 512×512, transparent background recommended

You can generate them quickly from any source image with:

- https://realfavicongenerator.net (best UX, free)
- `npx pwa-asset-generator your-logo.png ./public/icons` (CLI)

Until you add real icons, the app will still work — browsers just won't show
the "Install app" prompt because the manifest's `icons` array can't be
verified.
