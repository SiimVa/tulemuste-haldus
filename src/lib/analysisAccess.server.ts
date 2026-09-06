import { createHash, randomBytes } from "node:crypto"
import { isAnalysisLinkToken } from "./analysisAccess"

export function generateAnalysisLinkToken(): string {
  return randomBytes(32).toString("base64url")
}

export function hashAnalysisLinkToken(token: string): string {
  if (!isAnalysisLinkToken(token)) {
    throw new Error("Vigane analüüsilingi tunnus")
  }
  return createHash("sha256").update(token).digest("hex")
}
