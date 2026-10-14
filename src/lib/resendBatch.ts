// Resend permissive batch responses contain successes and indexed validation
// errors. Never acknowledge recipients from an incomplete/ambiguous response.
export function resendBatchFailures(payload: unknown, recipientCount: number): Map<number, string> {
  if (!payload || typeof payload !== "object") throw new Error("Resendi partii vastus on vigane")
  const { data, errors = [] } = payload as { data?: unknown; errors?: unknown }
  if (!Array.isArray(data) || !Array.isArray(errors)) throw new Error("Resendi partii vastus on vigane")
  const failures = new Map<number, string>()
  for (const error of errors) {
    if (!error || typeof error !== "object" || !Number.isInteger(error.index) || error.index < 0 || error.index >= recipientCount || typeof error.message !== "string" || failures.has(error.index)) throw new Error("Resendi partii saaja viga on vigane")
    failures.set(error.index, error.message)
  }
  if (data.length + failures.size !== recipientCount || data.some(item => !item || typeof item.id !== "string" || !item.id)) throw new Error("Resend ei kinnitanud kõigi partii saajate tulemust")
  return failures
}
