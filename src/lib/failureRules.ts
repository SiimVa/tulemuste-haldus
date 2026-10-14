import { evaluateFormula } from "./formula"
import { pointFieldValue } from "./pointFields"
import { exceptionKind, isFailedResult } from "./exceptionKinds"

export const FAILURE_MODES = ["AUTO", "FORCE_SUCCESS", "FORCE_FAILED"] as const
export type FailureMode = typeof FAILURE_MODES[number]
export const FAILURE_OPERATORS = ["=", "≠", "<", "≤", ">", "≥"] as const
export type FailureOperator = typeof FAILURE_OPERATORS[number]
export type FailureRule = { match: "ALL" | "ANY"; conditions: { field: string; operator: FailureOperator; value: number }[] }
export type FailureField = { name: string; label: string; type: string; formula?: string | null; meta?: string | null; order?: number }
export type FailureElement = { config?: unknown; fields: FailureField[]; exceptions: { label: string; penalty: number; kind?: string | null }[] }
export const FAILURE_FIELD_TYPES = ["NUMBER", "CHECKBOX", "TIME", "TIME_RANGE", "POINTS_SELECT", "TIME_POINTS", "ESTIMATION", "COMPUTED"]

export class FailureRuleError extends Error {}

export function readFailureRule(config: unknown): FailureRule | null {
  const parsed = typeof config === "string" ? JSON.parse(config || "{}") : config
  return (parsed as { failureRule?: FailureRule } | null)?.failureRule ?? null
}

export function validateFailureRule(config: unknown, fields: FailureField[]): string | null {
  try {
    const rule = readFailureRule(config)
    if (rule == null) return null
    if (!["ALL", "ANY"].includes(rule.match) || !Array.isArray(rule.conditions) || !rule.conditions.length || rule.conditions.length > 50) return "Vigane ebaõnnestumise tingimus"
    for (const condition of rule.conditions) {
      if (!condition || !FAILURE_OPERATORS.includes(condition.operator) || typeof condition.value !== "number" || !Number.isFinite(condition.value)) return "Ebaõnnestumise tingimuse võrdlus või piirväärtus on vigane"
      const matches = fields.filter(f => f.name === condition.field)
      if (matches.length !== 1 || !FAILURE_FIELD_TYPES.includes(matches[0].type)) return `Ebaõnnestumise tingimuse väli „${condition.field}” puudub või pole arvuline. Paranda tingimust või eemalda see.`
    }
    return null
  } catch { return "Vigane ebaõnnestumise seadistus" }
}

export function parseFailureMode(value: unknown, label: string | null | undefined, exceptions: FailureElement["exceptions"]): FailureMode {
  if (value === undefined) return isFailedResult({ exceptionLabel: label }, exceptions) ? "FORCE_FAILED" : "AUTO"
  if (!(FAILURE_MODES as readonly unknown[]).includes(value)) throw new FailureRuleError("Vigane ebaõnnestumise valik")
  return value as FailureMode
}

const present = (v: unknown) => v != null && String(v).trim() !== ""
function seconds(value: unknown): number {
  const parts = String(value).split(":")
  return parts.length === 1 ? Number(value) : parts.reduce((total, part) => total * 60 + Number(part), 0)
}

// Missing or invalid inputs remain unknown. In particular, failed formulas
// must never turn into zero and accidentally satisfy a failure condition.
export function failureFieldValues(values: Record<string, unknown>, fields: FailureField[]): Record<string, number> {
  const scope: Record<string, number> = Object.create(null)
  for (const field of fields.filter(f => f.type !== "COMPUTED")) {
    let value: number | null | undefined
    if (field.type === "TIME_RANGE") {
      if (!present(values[field.name + "_start"]) || !present(values[field.name + "_end"])) continue
      const start = seconds(values[field.name + "_start"]), end = seconds(values[field.name + "_end"])
      value = end >= start ? end - start : end + 86400 - start
    } else {
      const raw = values[field.name]
      if (!present(raw)) continue
      if (["POINTS_SELECT", "TIME_POINTS", "ESTIMATION"].includes(field.type)) value = pointFieldValue(field, String(raw))
      else if (field.type === "TIME") value = seconds(raw)
      else value = Number(raw)
    }
    if (value != null && Number.isFinite(value)) scope[field.name] = value
  }
  for (const field of fields.filter(f => f.type === "COMPUTED").sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
    try { scope[field.name] = evaluateFormula(field.formula ?? "", scope) } catch { /* unknown */ }
  }
  return scope
}

export function evaluateFailureRule(config: unknown, fields: FailureField[], values: Record<string, unknown>): { failed: boolean | null; reason: string } {
  const invalid = validateFailureRule(config, fields)
  if (invalid) return { failed: null, reason: invalid }
  const rule = readFailureRule(config)
  if (!rule) return { failed: false, reason: "Automaatset tingimust pole seadistatud" }
  const scope = failureFieldValues(values, fields)
  const missing = rule.conditions.filter(c => scope[c.field] === undefined)
  if (missing.length) return { failed: null, reason: `Automaatseks kontrolliks puudub ${[...new Set(missing.map(c => fields.find(f => f.name === c.field)!.label))].join(", ")}` }
  const checks = rule.conditions.map(c => {
    const value = scope[c.field]
    switch (c.operator) {
      case "=": return value === c.value
      case "≠": return value !== c.value
      case "<": return value < c.value
      case "≤": return value <= c.value
      case ">": return value > c.value
      case "≥": return value >= c.value
    }
  })
  const failed = rule.match === "ALL" ? checks.every(Boolean) : checks.some(Boolean)
  const details = rule.conditions.map(c => `${fields.find(f => f.name === c.field)!.label}: ${scope[c.field]} (ebaõnnestub, kui ${c.operator} ${c.value})`).join(rule.match === "ALL" ? "; ja " : "; või ")
  return { failed, reason: `${failed ? "Ebaõnnestus" : "Ei ebaõnnestunud"}: ${details}` }
}

export function resolveFailure(element: FailureElement, values: Record<string, unknown>, mode: FailureMode, label?: string | null) {
  // Other exceptions take precedence and keep their existing semantics.
  if (label && !isFailedResult({ exceptionLabel: label }, element.exceptions)) {
    const exception = element.exceptions.find(e => e.label === label)
    if (!exception) throw new FailureRuleError("Tundmatu erand")
    return { failureMode: mode, exceptionLabel: label, exceptionPenalty: exception.penalty, failureReason: label }
  }
  const evaluation = mode === "AUTO" ? evaluateFailureRule(element.config, element.fields, values) : {
    failed: mode === "FORCE_FAILED", reason: mode === "FORCE_FAILED" ? "Ebaõnnestus: kohtuniku otsus" : "Ei ebaõnnestunud: kohtuniku otsus",
  }
  if (evaluation.failed === null) throw new FailureRuleError(evaluation.reason)
  const failedException = element.exceptions.find(e => exceptionKind(e) === "FAILED")
  if (evaluation.failed && !failedException) throw new FailureRuleError("KP-l puudub ebaõnnestumise erand. Lisa see KP seadistusse.")
  return {
    failureMode: mode,
    exceptionLabel: evaluation.failed ? failedException!.label : null,
    exceptionPenalty: evaluation.failed ? failedException!.penalty : null,
    failureReason: evaluation.reason,
  }
}
