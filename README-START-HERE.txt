AMIR PRECISION CUTS — DESIGN WORKSPACE
======================================

Give this whole folder to Claude Design, together with the prompt in
CLAUDE-DESIGN-BRIEF.md (paste everything below the horizontal rule).

  FIRST   npm install                                  (needs network, ~300MB, once)
  CHECK   npm test                                     (expect 85 tests, 85 pass, 0 skipped)
  LOOP    npm run derive -- --only=assets,site && npm run build
  VIEW    npx http-server site -p 8080

THE ONE RULE
  site/ is GENERATED. Edit templates/ instead. Anything changed under site/
  is erased by the next derive - and it will look like it worked until then.

Never run a bare `npm run derive`: that also regenerates the brand voice and
topic queue, which need a model provider and will hard-stop without one.
Always pass --only=assets,site.
