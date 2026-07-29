/** Constant-time-ish compare without leaking length via early exit on hash compare of unequal digest sizes. */
export function constantTimeEqualPassword(a: string, b: string): boolean {
  const max = Math.max(a.length, b.length);
  let diff = a.length === b.length ? 0 : 1;
  for (let i = 0; i < max; i++) {
    const ca = i < a.length ? a.charCodeAt(i) : 0;
    const cb = i < b.length ? b.charCodeAt(i) : 0;
    diff |= ca ^ cb;
  }
  return diff === 0;
}

export async function delay(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}
