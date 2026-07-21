# Board images

Drop a photo of each board here and the app shows it in the Boards list and the
add-device picker (PAM-21). **No JSON editing needed** — just name the file after
the board id.

## Naming (convention)

```
images/<board-id>.png        (or .jpg / .jpeg / .webp)
```

The board id is the `id` field of the board's JSON in `resources/devices/`, e.g.:

| Board file                     | Image file                    |
| ------------------------------ | ----------------------------- |
| `resources/devices/apc-40-mk2.json` | `images/apc-40-mk2.png`  |
| `resources/devices/apc-mini.json`   | `images/apc-mini.png`    |
| `resources/devices/x-touch.json`    | `images/x-touch.png`     |

A board JSON may also set an explicit `"image": "myfile.png"` to override the
convention (plain filename only — no paths).

If no image exists, the UI shows a neutral placeholder — never a broken image.

## ⚠️ Licence — read before adding images

This repo is **public and GPL-3.0**. Only add images you are allowed to
distribute under those terms:

- **Your own photos / renders** — you hold the copyright. ✅ Preferred.
- Images with the **manufacturer's explicit written permission** for GPL
  redistribution. ✅ (keep proof.)
- **Do NOT** drop in manufacturer press/product photos, web images, or stock
  photos — those are copyrighted and must not be committed here. ❌

User boards (created in-app) resolve images from the user devices folder's own
`images/` subfolder — the same naming rule.

## Size

Keep them small: ~256 px on the long edge, **under ~150 KB**. They are sent to
the UI inline (base64), so large files bloat memory for no visible gain.
