# Site Intake Portal

`index.html` is the whole thing. No server, no build step, no dependencies.
It works from a `file://` URL — double-click it — and it works hosted.

## Hosting it

Any static host. Nothing needs configuring.

* **Vercel** — drag this folder onto <https://vercel.com/new>, or `npx vercel deploy --prod` from here.
* **Netlify** — drag it onto <https://app.netlify.com/drop>.
* **GitHub Pages / S3 / anything** — copy `index.html` in.

The only network request at runtime is Google Fonts, for the typeface preview.
Everything else — validation, the site preview, the YAML export — runs in the browser.

## What it produces

One `business.config.yaml`. That file is the entire input to the factory: the
brand voice, the banned-word list, the internal-link map, the byline, the topic
queue, the brand assets and the site itself all derive from it.

## Rebuilding it

    npm run portal

The portal is **generated from the repo**, not maintained beside it. That build
inlines the real validator (`scripts/config-schema.mjs`), the real renderer
(`scripts/site-render.mjs`), the layout variants and all 23 templates.

This matters more than it sounds. A portal with its own preview and its own
validation drifts from the builder, and the drift surfaces at the worst possible
moment — after a client has approved a preview of a site that doesn't exist. Here
the preview calls the same function `npm run derive` calls, against the same
templates, so it cannot disagree.

Add a section template or a layout variant and re-run `npm run portal`; the
portal picks it up with no edits.

## Editing it

Source lives beside the output:

| File | What it is |
|---|---|
| `fields.js` | the intake schema — every question, its config path, its hint |
| `app.js` | form rendering, validation wiring, preview, YAML export |
| `app.css` | styling |
| `shell.html` | the page frame |
| `index.html` | **generated — do not edit** |

To add a question, add a field to `fields.js` with the config path it writes, and
add the key to the validator in `scripts/config-schema.mjs`. If nothing reads the
key, don't ask for it — a form that collects fields the renderer ignores is
theatre, and it costs the person filling it in real time.
