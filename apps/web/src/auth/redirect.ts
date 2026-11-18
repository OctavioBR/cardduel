/** Only application destinations may be used after authentication. */
export function returnPath(value: string | null): string {
  if (
    !value?.startsWith("/") ||
    value.startsWith("//") ||
    [...value].some((char) => char === "\\" || char.charCodeAt(0) <= 32)
  )
    return "/";
  const parsed = new URL(value, "https://card-duel.invalid");
  if (
    parsed.origin !== "https://card-duel.invalid" ||
    !/^\/(?:$|decks(?:\/[^/]+)?$|r\/[2-9A-Z]{6}$|account$)/.test(parsed.pathname)
  )
    return "/";
  return parsed.pathname + parsed.search;
}
