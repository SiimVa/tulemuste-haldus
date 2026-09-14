// Keep OAuth's host-only PKCE cookie on the same host as its callback.
// Restrict redirects to our known public aliases; local/test hosts stay local.
export function canonicalAuthRedirect(requestUrl: string, configuredUrl?: string): URL | null {
  if (!configuredUrl) return null
  const request = new URL(requestUrl)
  const canonical = new URL(configuredUrl)
  const aliases = ["matkamang.ee", "www.matkamang.ee"]
  if (!aliases.includes(request.hostname) || !aliases.includes(canonical.hostname) ||
      canonical.protocol !== "https:" || request.origin === canonical.origin) return null
  const target = new URL(canonical.origin)
  target.pathname = request.pathname
  target.search = request.search
  return target
}
