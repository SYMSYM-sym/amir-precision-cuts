export type TopicBucket =
  | 'first-timer'
  | 'hyperlocal'
  | 'comparison'
  | 'aftercare'
  | 'service-detail'
  | 'demographic'
  | 'commercial'
  | 'pricing'
  | 'eeat'
  | 'question'
  | 'seasonal';

export type Topic = {
  slug: string;
  title: string;
  target_keyword: string;
  secondary_keywords?: string[];
  intent: string;
  bucket: TopicBucket;
  internal_links?: Array<{ service?: string; page?: string }>;
  notes?: string;
};
