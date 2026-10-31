/** The conversation the client sends: oldest exchanges go first when the whole thing would not fit the request limit,
 *  so a pasted job description as the newest turn always arrives. */
export function trimHistory<T>(history: T[], maxChars = 20_000): T[] {
  let h = history;
  while (h.length > 1 && JSON.stringify(h).length > maxChars) h = h.slice(1);
  return h;
}
