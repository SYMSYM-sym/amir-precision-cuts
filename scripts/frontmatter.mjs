/**
 * Authoritative frontmatter fields come from the topic, not the model.
 * The model only writes prose body and meta description.
 */
export function applyAuthoritativeFrontmatter(data, topic, isoDate) {
  data.slug = topic.slug;
  data.title = data.title || topic.title;
  data.target_keyword = data.target_keyword || topic.target_keyword;
  data.intent = topic.intent;
  data.bucket = topic.bucket;
  data.date = data.date || isoDate;
  data.author = data.author || 'ifm-team';
  if (!Array.isArray(data.secondary_keywords) || data.secondary_keywords.length === 0) {
    data.secondary_keywords = topic.secondary_keywords || [];
  }
  return data;
}
