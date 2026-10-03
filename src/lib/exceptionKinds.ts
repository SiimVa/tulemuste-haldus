// Erandi liik. Erandi nimi on korraldaja vabatekst, seega „Ei läbinud”,
// „Läbis aga ei sooritanud” ja „Ebaõnnestus” tuvastamiseks hoitakse liiki
// eraldi. Vanematel eranditel liik puudub ja see tuletatakse nimest.
//
// „Ebaõnnestus” (FAILED) mõjutab ka hindamist: pingereaga meetodites jääb
// võistkond pingeritta viimasele kohale halvima tulemusega, teised erandid
// saavad kindla karistuse ja jäävad pingereast välja.

export const EXCEPTION_KINDS = ["NOT_PASSED", "PASSED_NOT_DONE", "FAILED", "OTHER"] as const
export type ExceptionKind = (typeof EXCEPTION_KINDS)[number]

export const EXCEPTION_KIND_LABELS: Record<ExceptionKind, string> = {
  NOT_PASSED: "Ei läbinud",
  PASSED_NOT_DONE: "Läbis, aga ei sooritanud",
  FAILED: "Ebaõnnestus",
  OTHER: "Muu erand",
}

export function isExceptionKind(value: unknown): value is ExceptionKind {
  return typeof value === "string" && (EXCEPTION_KINDS as readonly string[]).includes(value)
}

export function inferExceptionKind(label: string): ExceptionKind {
  const normalized = label.toLocaleLowerCase("et").replace(/[,.]/g, " ").replace(/\s+/g, " ").trim()
  if (/^ei läbinud( |$)/.test(normalized)) return "NOT_PASSED"
  if (/^läbis aga ei sooritanud( |$)/.test(normalized)) return "PASSED_NOT_DONE"
  if (/^ebaõnnestu/.test(normalized)) return "FAILED"
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

// Ebaõnnestunud sooritus: võistkond tegi ülesande, kuid mitte kriteeriumite järgi.
export function isFailedResult(
  result: { exceptionLabel?: string | null },
  exceptions: { label: string; kind?: string | null }[]
): boolean {
  return resultExceptionKind(result.exceptionLabel, exceptions) === "FAILED"
}

// Ebaõnnestunud tulemusel on sooritus olemas: väljaväärtused sisestatakse ja
// näidatakse koos märkega. Teiste erandite korral sooritust polnud ja väärtusi
// ei hoita.
export function resultKeepsValues(
  result: { exceptionLabel?: string | null },
  exceptions: { label: string; kind?: string | null }[]
): boolean {
  return !result.exceptionLabel || isFailedResult(result, exceptions)
}

// Meetodid, kus ebaõnnestunu jääb pingeritta viimaseks ja erandi karistust ei
// kasutata.
export const FAILED_RANKED_CALC_TYPES: readonly string[] = ["RELATIVE_RANKING", "FIXED_RANKING", "VALUE_BASED"]

// Pingereaga ja kombineeritud elemendis annab ebaõnnestumine viimase koha ja
// erandi karistust ei kasutata.
export function failedGetsLastPlace(
  exception: { label: string; kind?: string | null },
  element: { calcType?: string | null; hasSections?: boolean }
): boolean {
  return exceptionKind(exception) === "FAILED" &&
    (Boolean(element.hasSections) || FAILED_RANKED_CALC_TYPES.includes(element.calcType ?? ""))
}

// Erandi valik sisestusvormis: karistus või ebaõnnestumisel viimane koht.
export function exceptionOptionLabel(
  exception: { label: string; penalty: number; kind?: string | null },
  element: { calcType?: string | null; hasSections?: boolean },
  penaltySuffix = "p"
): string {
  return failedGetsLastPlace(exception, element)
    ? `${exception.label} (viimane koht)`
    : `${exception.label} (${exception.penalty}${penaltySuffix})`
}

export const FAILED_EXCEPTION_LABEL = "Ebaõnnestus"

// „Ebaõnnestus” karistust kasutatakse ainult ilma pingereata hindamisel:
// punktisüsteemis 0 punkti, karistuspunktides KP maksimum.
export function failedExceptionPenalty(scoringMode: string, kpMaxValue: number): number {
  return scoringMode === "PLUS" ? 0 : kpMaxValue
}
