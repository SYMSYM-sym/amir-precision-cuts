import { Octokit } from '@octokit/rest';
import { GH_OWNER, GH_REPO } from './identity';
import type { DashboardPR } from '@/types/pr';
import type { WorkflowRunSummary } from '@/types/run';

// Identity comes from lib/identity.ts, which has no defaults. See bug A4 there.
const owner = GH_OWNER;
const repo = GH_REPO;

function octo(): Octokit {
  const auth = process.env.GH_TOKEN;
  if (!auth) throw new Error('GH_TOKEN is not configured');
  return new Octokit({ auth });
}

export async function getFile(path: string) {
  const oct = octo();
  const res = await oct.repos.getContent({ owner, repo, path });
  if (Array.isArray(res.data)) throw new Error(`${path} is a directory`);
  if (res.data.type !== 'file') throw new Error(`${path} not a file`);
  const content = Buffer.from(res.data.content, 'base64').toString('utf8');
  return { content, sha: res.data.sha };
}

export async function putFile(path: string, content: string, message: string, sha?: string) {
  const oct = octo();
  return oct.repos.createOrUpdateFileContents({
    owner,
    repo,
    path,
    message,
    content: Buffer.from(content, 'utf8').toString('base64'),
    sha,
  });
}

export async function listOpenAutoArticlePRs(): Promise<DashboardPR[]> {
  const oct = octo();
  const { data } = await oct.pulls.list({ owner, repo, state: 'open', per_page: 50 });
  return data
    .filter((p) => p.labels.some((l) => l.name === 'auto-article'))
    .map((p) => ({
      number: p.number,
      title: p.title,
      html_url: p.html_url,
      created_at: p.created_at,
      body: p.body,
      labels: p.labels.map((l) => l.name),
      head_ref: p.head.ref,
    }));
}

export async function setLabel(prNumber: number, label: string, on: boolean) {
  const oct = octo();
  if (on) {
    await oct.issues.addLabels({ owner, repo, issue_number: prNumber, labels: [label] });
  } else {
    await oct.issues.removeLabel({ owner, repo, issue_number: prNumber, name: label }).catch(() => {});
  }
}

export async function mergePR(prNumber: number) {
  const oct = octo();
  await oct.pulls.merge({ owner, repo, pull_number: prNumber, merge_method: 'squash' });
}

export async function closePRAndDeleteBranch(prNumber: number) {
  const oct = octo();
  const { data: pr } = await oct.pulls.get({ owner, repo, pull_number: prNumber });
  await oct.pulls.update({ owner, repo, pull_number: prNumber, state: 'closed' });
  const ref = `heads/${pr.head.ref}`;
  await oct.git.deleteRef({ owner, repo, ref }).catch(() => {});
}

export async function listWorkflowRuns(filename = 'publish-article.yml'): Promise<WorkflowRunSummary[]> {
  const oct = octo();
  const { data } = await oct.actions.listWorkflowRuns({
    owner,
    repo,
    workflow_id: filename,
    per_page: 20,
  });
  return data.workflow_runs.map((r) => ({
    id: r.id,
    name: r.name ?? null,
    conclusion: r.conclusion ?? null,
    status: r.status ?? 'unknown',
    html_url: r.html_url,
    run_started_at: r.run_started_at ?? null,
    updated_at: r.updated_at ?? '',
    head_sha: r.head_sha ?? '',
  }));
}

export async function dispatchWorkflow(
  filename = 'publish-article.yml',
  inputs: Record<string, string> = {},
) {
  const oct = octo();
  await oct.actions.createWorkflowDispatch({
    owner,
    repo,
    workflow_id: filename,
    ref: 'main',
    inputs,
  });
}

export async function listBlogArticles() {
  const oct = octo();
  const res = await oct.repos.getContent({ owner, repo, path: 'blog' });
  if (!Array.isArray(res.data)) return [];
  return res.data.filter((d) => d.type === 'dir' && d.name !== 'dry-run-sample');
}

export async function getEmbeddingsFileMeta(): Promise<{ committed_at: string | null } | null> {
  const oct = octo();
  try {
    await oct.repos.getContent({ owner, repo, path: 'content/articles/_embeddings.json' });
  } catch {
    return null;
  }
  const { data } = await oct.repos.listCommits({
    owner,
    repo,
    path: 'content/articles/_embeddings.json',
    per_page: 1,
  });
  const c = data[0]?.commit?.committer?.date ?? data[0]?.commit?.author?.date ?? null;
  return { committed_at: c };
}
