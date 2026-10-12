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

// Erandi valik sisestusvormis: erandi punktid või ebaõnnestumisel viimane
// koht. Plusspunktides näidatakse punkte märgiga, sest erand võib nii anda kui
// lahutada.
export function exceptionOptionLabel(
  exception: { label: string; penalty: number; kind?: string | null },
  element: { calcType?: string | null; hasSections?: boolean },
  scoringMode: string,
  penaltySuffix = "p"
): string {
  if (failedGetsLastPlace(exception, element)) return `${exception.label} (viimane koht)`
  return scoringMode === "PLUS"
    ? `${exception.label} (${formatExceptionScore(exception.penalty, scoringMode)})`
    : `${exception.label} (${exception.penalty}${penaltySuffix})`
}

// Erandi punktid hindamises. Karistuspunktides on erandi väärtus alati
// karistus. Plusspunktides on väärtus märgiga: positiivne annab punkte,
// negatiivne lahutab.
export function exceptionScore(value: number | null | undefined, scoringMode: string): number {
  const points = value ?? 0
  return scoringMode === "PLUS" ? points : Math.abs(points)
}

// Erandi mõju kogusummale märgiga, nt „+5p” või „−5p”.
export function formatExceptionScore(value: number | null | undefined, scoringMode: string): string {
  const points = exceptionScore(value, scoringMode)
  if (points === 0) return "0p"
  return `${points > 0 ? "+" : "−"}${Math.abs(points)}p`
}

// Võistluse vaikimisi erandiväärtused. Plusspunktides annab positiivne väärtus
// punkte, seega karistuspunktide vaikeväärtused (40/35) seal ei sobi.
export function defaultExceptionValues(scoringMode: string): { defaultNotPassed: number; defaultPassedNotDone: number } {
  return scoringMode === "PLUS"
    ? { defaultNotPassed: 0, defaultPassedNotDone: 0 }
    : { defaultNotPassed: 40, defaultPassedNotDone: 35 }
}

// Hindamisviisi vahetamisel asendatakse erandite vaikeväärtused uue viisi
// omadega, kui korraldaja pole neid muutnud.
export function exceptionDefaultsForModeChange<T extends { scoringMode: string; defaultNotPassed: number; defaultPassedNotDone: number }>(
  form: T,
  scoringMode: string
): T {
  const previous = defaultExceptionValues(form.scoringMode)
  const untouched = Number(form.defaultNotPassed) === previous.defaultNotPassed &&
    Number(form.defaultPassedNotDone) === previous.defaultPassedNotDone
  return untouched
    ? { ...form, scoringMode, ...defaultExceptionValues(scoringMode) }
    : { ...form, scoringMode }
}

// Elemendi vormi selgitus erandi väärtuse kohta.
export function exceptionValueHint(scoringMode: string | null | undefined): string {
  return scoringMode === "PLUS"
    ? "Plusspunktides on väärtus märgiga: positiivne arv annab punkte (5 → +5p), negatiivne lahutab (−5 → −5p)."
    : "Karistuspunktides lisatakse väärtus karistusena kogusummale."
}

export const FAILED_EXCEPTION_LABEL = "Ebaõnnestus"

// „Ebaõnnestus” karistust kasutatakse ainult ilma pingereata hindamisel:
// punktisüsteemis 0 punkti, karistuspunktides KP maksimum.
export function failedExceptionPenalty(scoringMode: string, kpMaxValue: number): number {
  return scoringMode === "PLUS" ? 0 : kpMaxValue
}
