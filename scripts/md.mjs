/**
 * md.mjs — parse markdown-with-frontmatter SAFELY.
 *
 * gray-matter memoises by input string: `matter(s)` twice returns the SAME
 * `data` object. Anything that mutates it — and `applyAuthoritativeFrontmatter`
 * mutates it by contract (R3) — corrupts every other holder of that parse.
 *
 * It surfaced as a test failure: one case deleted `description` to prove the
 * injector leaves it alone, and a later case then found the field missing from
 * a file it had never touched. In production the same shape is one refactor
 * away: validate-article and build-blog parse identical bytes, and a future
 * mutation in either would silently corrupt the other.
 *
 * Passing an options object bypasses the cache. Use this everywhere.
 */
import matter from 'gray-matter';

export function parseMd(raw) {
  return matter(raw, { excerpt: false });
}

export { matter };
