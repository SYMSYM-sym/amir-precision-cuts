export const MAX_TOPICS_PER_RUN = 3;
export const MAX_REGEN_PER_TOPIC = 2;

export function classifyFailure(errors) {
  const joined = errors.join(' | ');
  if (/Originality:|Forbidden:/.test(joined)) return 'PERMANENT';
  return 'TRANSIENT';
}

export function isConfigError(err) {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('ANTHROPIC_API_KEY is not set');
}
