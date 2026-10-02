// Only same-origin paths. Browsers read "\" as "/" and drop tabs and newlines,
// so "/\evil.example" and "/\t/evil.example" would leave the site.
export function safeCallbackPath(
  value: string | null | undefined,
  fallback = "/dashboard"
): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u001f\u007f]/.test(value)
  ) {
    return fallback
  }
  return value
}
