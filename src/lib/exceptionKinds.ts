// Erandi liik statistika jaoks. Erandi nimi on korraldaja vabatekst, seega
// „Ei läbinud” ja „Läbis aga ei sooritanud” tuvastamiseks hoitakse liiki
// eraldi. Vanematel eranditel liik puudub ja see tuletatakse nimest.

export const EXCEPTION_KINDS = ["NOT_PASSED", "PASSED_NOT_DONE", "OTHER"] as const
export type ExceptionKind = (typeof EXCEPTION_KINDS)[number]

export const EXCEPTION_KIND_LABELS: Record<ExceptionKind, string> = {
  NOT_PASSED: "Ei läbinud",
  PASSED_NOT_DONE: "Läbis, aga ei sooritanud",
  OTHER: "Muu erand",
}

export function isExceptionKind(value: unknown): value is ExceptionKind {
  return typeof value === "string" && (EXCEPTION_KINDS as readonly string[]).includes(value)
}

export function inferExceptionKind(label: string): ExceptionKind {
  const normalized = label.toLocaleLowerCase("et").replace(/[,.]/g, " ").replace(/\s+/g, " ").trim()
  if (/^ei läbinud( |$)/.test(normalized)) return "NOT_PASSED"
  if (/^läbis aga ei sooritanud( |$)/.test(normalized)) return "PASSED_NOT_DONE"
  return "OTHER"
}

export function exceptionKind(exception: { label: string; kind?: string | null }): ExceptionKind {
  return isExceptionKind(exception.kind) ? exception.kind : inferExceptionKind(exception.label)
}

// Tulemuse erandi liik. Tulemuses on erandi nimi; kui elemendi erandit on
// hiljem ümber nimetatud, tuletatakse liik tulemuses olevast nimest.
export function resultExceptionKind(
  label: string | null | undefined,
  exceptions: { label: string; kind?: string | null }[]
): ExceptionKind | null {
  if (!label) return null
  const match = exceptions.find((exception) => exception.label === label)
  return match ? exceptionKind(match) : inferExceptionKind(label)
}

// Kliendi saadetud liik; tundmatu väärtus tähendab, et liik tuletatakse nimest.
export function parseExceptionKind(value: unknown, label: string): ExceptionKind {
  return isExceptionKind(value) ? value : inferExceptionKind(label)
}
