import { createHash, randomBytes } from "node:crypto"
import { isRegistrationLinkToken } from "./registrationAccess"

export function generateRegistrationLinkToken(): string {
  return randomBytes(32).toString("base64url")
}

export function hashRegistrationLinkToken(token: string): string {
  if (!isRegistrationLinkToken(token)) {
    throw new Error("Vigane registreerimislingi tunnus")
  }
  return createHash("sha256").update(token).digest("hex")
}
