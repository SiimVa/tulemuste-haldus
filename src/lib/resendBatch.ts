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

// Successes retain their input order, with indexed validation failures omitted.
export function resendBatchResults(payload: unknown, recipientCount: number) {
  const failures = resendBatchFailures(payload, recipientCount)
  const data = (payload as { data: { id: string }[] }).data
  if (new Set(data.map(item => item.id)).size !== data.length) throw new Error("Resendi partii sisaldab korduvaid kirja ID-sid")
  const ids = new Map<number, string>()
  let successIndex = 0
  for (let index = 0; index < recipientCount; index++) {
    if (!failures.has(index)) ids.set(index, data[successIndex++].id)
  }
  return { failures, ids }
}
