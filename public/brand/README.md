Place the supplied Exter Media artwork here without redrawing it:

- `exter-logo-mark.svg`: original logo, displayed at top left on white.
- `exter-app-icon.svg`: original app icon, used as favicon.

The SVG attachments were not present in the branding request, so these files have
not been fabricated. Until they are supplied, the app shows a text wordmark and
the existing generic icon recoloured to the requested palette. `/api/branding`
detects the exact SVG files after they are added and deployed.

`fonts/Inter-variable.ttf` is the active self-hosted font from Google Fonts, under
`fonts/Inter-OFL.txt` (SIL Open Font License). The older Manrope asset is retained
for compatibility with earlier deployments. No external font service is required by the app.
