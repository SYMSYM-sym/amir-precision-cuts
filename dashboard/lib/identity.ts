/**
 * identity.ts — who this dashboard belongs to.
 *
 * BUG A4, generalised. The porting notes list three files with
 * `process.env.GH_OWNER ?? 'SYMSYM-sym'` style fallbacks. There are five:
 * lib/github.ts, lib/articles.ts, app/api/cron/publish/route.ts, and two
 * page components with the reference domain and repo name written into
 * user-visible copy.
 *
 * Every one of them made the same bet — that a missing env var is better
 * handled by guessing than by failing. It is not. A dashboard pointed at
 * another business's repository looks like it is working: real PRs, real runs,
 * real queue. The mistake is only visible once you write to it.
 *
 * There is exactly one place identity is read, and it has no defaults.
 */

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `${name} is not configured.\n\n` +
        'Identity deliberately has no default in this dashboard. A fallback ' +
        "would point it at another business's repository, and that failure is " +
        'invisible until it writes something.\n' +
        'Set it in the environment — see dashboard/.env.example.',
    );
  }
  return v;
}

export const GH_OWNER = required('GH_OWNER');
export const GH_REPO = required('GH_REPO');
export const REPO_SLUG = `${GH_OWNER}/${GH_REPO}`;

export { LIVE_URL, BUSINESS_NAME } from './generated-constants';
