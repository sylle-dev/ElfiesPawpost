# Original Elfie mascot

The illustration was generated with the built-in ImageGen tool for this project. It does not come from FFXIV files.

- **`elfie-courier.source.png`**: 1224 × 1285 original, recovered from the original ImageGen output and kept here for future edits. It is not included in the distribution.
- **`elfie-courier.png`**: optimized version used by the panel, 384 × 403 and 53,066 bytes. Following the optimization work contributed by the user, it was downscaled with LANCZOS and quantized to a 256-color palette with transparency. Dimensions, size and the match against the packaged copy were checked on 6 September 2026.

`tools/prepare-web.mjs` copies only the optimized version into `web/public/`. The original stays in this folder: it depends neither on a temporary directory nor on the prompt reproducing the same image.

Prompt used:

> Use case: stylized-concept. Create one original charming adult anime catgirl courier mascot for a personal FFXIV companion chat app called Elfie's Pawpost. Waist-up sticker illustration, pale pink bobbed hair, fluffy cat ears, mint-green eyes, modest cream and mint courier outfit, tiny pink ribbon, holding a pastel envelope with a paw seal and smiling warmly. Clean expressive anime line art, soft pastel pink mint lavender palette, readable silhouette at small size. Transparent background, subject centered with generous clear edges. No text, no lettering, no logos, no game screenshot. Single character. Save as a project asset.
