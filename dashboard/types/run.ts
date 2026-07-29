export type WorkflowRunSummary = {
  id: number;
  name: string | null;
  conclusion: string | null;
  status: string;
  html_url: string;
  run_started_at: string | null;
  updated_at: string;
  head_sha: string;
};
