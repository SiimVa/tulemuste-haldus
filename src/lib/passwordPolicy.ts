export const MIN_PASSWORD_LENGTH = 12
// The sign-in form accepts at most this many characters.
const MAX_PASSWORD_LENGTH = 1024

export function passwordPolicyError(value: unknown): string | null {
  if (typeof value !== "string" || value.length < MIN_PASSWORD_LENGTH) {
    return `Parool peab olema vähemalt ${MIN_PASSWORD_LENGTH} tähemärki`
  }
  if (value.length > MAX_PASSWORD_LENGTH) return "Parool on liiga pikk"
  return null
}
