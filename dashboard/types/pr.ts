export type DashboardPR = {
  number: number;
  title: string;
  html_url: string;
  created_at: string;
  body: string | null;
  labels: string[];
  head_ref: string;
};
