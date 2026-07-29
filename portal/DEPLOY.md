# Deploying the portal

`portal/index.html` is one self-contained file. Any static host works, and the
fastest route is dragging this folder onto <https://vercel.com/new> or
<https://app.netlify.com/drop>.

## The live deployment

    https://site-intake-portal-smsymsym.vercel.app

Currently behind **Vercel Authentication** (this team enables deployment
protection by default), so only team members can open it. To make it public:

> Vercel → the `site-intake-portal` project → Settings → Deployment Protection
> → Vercel Authentication → **Disabled** → Save.

Until then a 24-hour share link works: Vercel → project → the deployment →
*Share*.

## How it was deployed, and why it looks odd

Vercel's deploy API takes file contents **inline**. The portal is ~194 KB, so
transmitting it through an agent's tool call is both expensive and fragile —
one wrong character in the middle of a bundle produces a page that half-works.

So the deployment ships four tiny files and fetches the bundle at build time:

    build.sh    curl the bundle, verify SHA-256, refuse to publish on mismatch
    package.json
    vercel.json security + cache headers
    README.md

`build.sh` uses `set -euo pipefail` and checks both the checksum and a minimum
byte count. That matters more than it looks: without it a failed or truncated
fetch leaves an empty `dist/index.html` and the deploy goes **green** with a
broken page. That is the same shape of silent success that let the publishing
pipeline in this very system run dead for eight days.

## Redeploying after a change

    npm run portal                      # rebuild portal/index.html
    sha256sum portal/index.html         # note the hash

Upload the file somewhere the build can reach it, then update `SRC` and `SHA`
in the deployment's `build.sh` and redeploy. If you have a Vercel token, it is
simpler to skip all of this:

    npx vercel deploy --prod portal/
