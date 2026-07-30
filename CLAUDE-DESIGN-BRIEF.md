# Redesign brief — Amir Precision Cuts

Paste everything below the line into Claude Design, with the workspace folder attached.

---

## What you're working on

A live marketing site for **Amir Precision Cuts**, a one-chair men's barbershop at
17388 Ventura Blvd, Encino, CA. Live at
https://amir-precision-cuts-smsymsym.vercel.app

Your job: **make it look considerably better** — more confident, more current, more
like a barbershop someone screenshots and sends to a friend. It currently looks
correct and restrained but generic; it reads as a good template rather than as a
place with a point of view.

**Read this whole brief before touching a file.** There is one architectural rule
that will silently erase your work if you miss it.

---

## THE RULE THAT MATTERS MOST

**`site/` is generated output. Never edit anything in it.**

Every file under `site/` — including `site/index.html` and
`site/assets/styles.css` — is rebuilt from scratch by `npm run derive`. Editing
them looks like it works, right up until the next build silently reverts
everything you did.

The design lives in **`templates/`**. That is where you work:

```
templates/
  styles.css              ← the entire stylesheet (a template; see "partitioned" below)
  page.html               ← homepage shell
  article.html            ← blog article shell
  blog-index.html         ← blog index shell
  partials/
    head.html  nav.html  topbar.html  footer.html  hero-media.html
  sections/
    hero.classic.html     ← the one this client uses
    hero.editorial.html  hero.compact.html  hero.gallery.html
    about.centered.html   ← this client
    about.split.html
    services.columns.html ← this client
    services.rows.html  services.grid.html  services.table.html
    gallery.grid.html     ← this client
    aftercare.columns.html ← this client
    aftercare.inline.html  aftercare.steps.html
    faq.accordion.html    ← this client
    visit.stacked.html    ← this client
    visit.split.html
  script.js               ← the site's only JS (vanilla, no framework)
scripts/layout-variants.mjs ← design tokens + section order per layout variant
```

To see your changes:

```bash
npm install                            # needed once; requires network
npm run derive -- --only=assets,site   # regenerates site/ from templates/
npm run build                          # regenerates the blog pages
npx http-server site -p 8080           # or any static server
```

**Always pass `--only=assets,site`. Never run a bare `npm run derive`** — that
also regenerates the brand voice and the topic queue, which need a model provider
and will hard-stop without one. `--only=assets,site` is the design loop and needs
nothing but the repo.

`npm install` pulls ~300MB, most of it a local embeddings model and Playwright
that the content pipeline uses and the design work does not. If the install is
painful, the design and build path itself only needs three packages:
`js-yaml`, `marked`, `gray-matter`.

---

## The system you're designing inside

This is not one website. It is a **template factory** that generates a complete
site for any personal-services business — barbershop, nail salon, lash studio,
med spa, tattoo parlour — from a single `business.config.yaml`. Amir is client #1.

Three consequences for you:

**1. No business facts in CSS or HTML templates.** Not the name, not "Encino", not
the phone number, not "barbershop". Everything comes through template variables
like `{{business.name}}`, `{{location.address_city}}`, `{{derived.hours_line}}`.
A grep enforces this and the build fails if you hardcode one. If you find
yourself wanting to write "barber" in a template, that word belongs in the config
as `business.type`, and it is already there.

**2. There are FOUR layout variants** — `editorial`, `compact`, `gallery`,
`classic` — and they must all keep working. Amir uses `classic`. They are not
colour schemes: each one has its own section ORDER, its own set of section
templates, and its own type/space tokens (`scripts/layout-variants.mjs`). A change
that only looks good in `classic` and breaks `gallery` will fail the test suite.

**3. `templates/styles.css` is PARTITIONED by variant.** Everything above
`{{#if IS_EDITORIAL}}` (around line 313) is SHARED by all four layouts. Below that
are four variant-only blocks. **A rule written inside the wrong block ships for one
layout and silently vanishes for the other three.** This has already caused one
real bug — a whole section rendered with browser-default styling on a client's
homepage — so there is now a test (`scripts/layout-css.test.mjs`) that renders
every variant and fails on any class with no matching rule. Put shared rules
above the partition.

---

## What is already good — please keep it

- **The art direction.** Near-black `#121212`, gold `#c9a227`, abstract silhouette
  and shadow artwork. The imagery is deliberately non-photographic and the page
  says so ("Artwork is illustrative — abstract studies, not photographs of the
  shop"). Do not replace it with stock barbershop photos. Recolouring, cropping,
  masking, layering, adding grain — all fair game.
- **The price board.** The services section with dotted leaders reads like a real
  barbershop price list. It is the strongest thing on the page.
- **The copy.** Plain, exact, unsold. Do not make it louder. Don't add "Book your
  transformation today" anywhere.
- **The restraint.** This should stay a quiet, expensive-looking site. The brief is
  "more confident", not "more busy".

---

## What is weak — please fix

1. **Everything is centred, at the same rhythm, forever.** Seven sections, all
   centre-aligned, all with identical vertical padding. No pacing, no contrast,
   nothing that makes you slow down. This is the single biggest problem.
2. **The hero is timid.** A 45px headline on a 900px-tall section, floating in the
   middle. It should be arresting. Consider scale, asymmetry, letting the artwork
   do more, a real editorial lockup.
3. **No texture or depth.** Flat black behind everything. The photography has grain
   and the page has none, so the images sit on the page rather than in it.
4. **Type is doing the minimum.** Playfair Display + Work Sans is a competent
   default and reads as one. The scale is timid, tracking is untuned, and there is
   no display moment anywhere.
5. **The aftercare section is shapeless** — one long paragraph, then two short
   columns. It needs a real structure.
6. **Nav, FAQ and visit sections are undesigned.** They work; nothing more.
7. **One accent colour, used sparingly and identically everywhere.** There is room
   for a second tone, or for depth in the surface colours.

---

## Hard constraints — the build enforces all of these

Run `npm test` before you finish. **85 tests, 85 passing, 0 skipped.** If you see
9 skipped, `fixtures/` has gone missing — those 9 are the per-variant CSS checks,
and without them nothing stops a rule in the wrong partition block from silently
breaking three of the four layouts.

- **WCAG AA contrast is gated at build time.** `assertContrast()` fails the build on
  a bad palette pair. Text over imagery also has to hold up — the hero currently
  measures 6.08:1 at its worst against the artwork, measured from rendered pixels.
  Don't regress it.
- **Every `<img>` needs alt text.** Validation error, not a warning.
- **A skip link must remain the first tab stop on every page** (WCAG 2.4.1), and
  focus rings must stay visible. `axe-core` currently reports **0 violations** on
  all three page types.
- **Motion must not hurt contrast.** The reveal animation deliberately *slides*
  rather than fades — an earlier opacity fade put 61 nodes below AA mid-transition.
  Respect `prefers-reduced-motion`; it's already wired up.
- **Performance budget: LCP 160ms, CLS 0, ~186KB homepage.** No web fonts beyond
  the two already loaded (and they load non-blocking on purpose — don't make the
  stylesheet render-blocking again). No JS frameworks. No CSS-in-JS. No build step:
  `styles.css` is a plain stylesheet rendered through a template engine.
- **The template engine is strict.** `{{foo.bar}}` throws at build time if the path
  doesn't resolve. That is deliberate. If a value is genuinely optional, write
  `{{?foo.bar}}` or `{{#if ?foo.bar}}`. Available helpers: `{{#if}}` `{{#unless}}`
  `{{#each}}` `{{else}}` `{{> partial}}` `{{../parent}}` `{{@index}}` `{{@first}}`
  `{{@last}}`, and `{{{raw}}}` for pre-rendered HTML.
- **CSS custom properties come from the variant tokens** in
  `scripts/layout-variants.mjs` — `--step-0` … `--step-4` (type scale), `--space`,
  `--section-y`, `--measure`, `--radius`, `--rule`, `--max`, `--pad`,
  `--display-weight`, `--display-tracking`, `--eyebrow-tracking`, `--nav-h`. Change
  the tokens to change proportions across a whole variant; that is the intended
  lever, and it is how the four variants stay genuinely different rather than
  recoloured.

---

## How to check your work

```bash
npm test                                   # 85 tests: all four variants, CSS coverage, engine
npm run derive -- --only=assets,site       # rebuild the site from templates
npm run build                              # rebuild blog pages
node scripts/verify-live.mjs http://localhost:8080   # 38 checks
```

Then look at all four variants, not just Amir's. `npm test` catches missing CSS
per variant, but only your eyes catch a layout that is merely ugly:

```bash
cp business.config.yaml /tmp/cfg.bak
for v in editorial compact gallery classic; do
  sed -i "s/layout_variant: \"[a-z]*\"/layout_variant: \"$v\"/" business.config.yaml
  npm run derive -- --only=site && npm run build
  # ...look at site/index.html, then continue
done
cp /tmp/cfg.bak business.config.yaml   # Amir is "classic" — put it back
npm run derive -- --only=site && npm run build
```

**Please also check `/blog/` and one article page.** They share the palette and
type but have their own templates and are easy to forget.

---

## Deliverable

Changes to `templates/` and `scripts/layout-variants.mjs` only. Leave `site/`
alone — it regenerates. Tell me in one paragraph what you changed and why, and
flag anything you deliberately left because it would have broken the
multi-business constraint.
