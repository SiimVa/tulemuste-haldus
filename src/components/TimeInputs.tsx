"use client"

import React from "react"

// ─── Kestvuse sisestus (stopper-stiil) ────────────────────────────────────────
// Kirjuta ainult numbreid — koolonid tekivad ise, täites PAREMALT: viimased 2
// numbrit = sekundid, siis minutid, siis tunnid. Tagastab "h:mm:ss" või "m:ss",
// mille parseTimeToSeconds oskab lugeda.
//   "45"    → "0:45"
//   "4500"  → "45:00"
//   "13045" → "1:30:45"
export function formatDurationDigits(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(-6)
  if (!d) return ""
  const p = d.padStart(6, "0")
  const h = parseInt(p.slice(0, 2), 10)
  const m = p.slice(2, 4)
  const s = p.slice(4, 6)
  return h > 0 ? `${h}:${m}:${s}` : `${parseInt(m, 10)}:${s}`
}

type DurationProps = {
  value: string
  onChange: (v: string) => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

export function TimeDurationInput({ value, onChange, onKeyDown, placeholder, className, disabled }: DurationProps) {
  return (
    <input
      type="text"
      inputMode="numeric"
      value={value}
      onChange={(e) => onChange(formatDurationDigits(e.target.value))}
      onKeyDown={onKeyDown}
      placeholder={placeholder ?? "m:ss"}
      className={className}
      disabled={disabled}
    />
  )
}

// ─── Kellaaeg (natiivne valija) ───────────────────────────────────────────────
// Normaliseeri suvaline "h:mm:ss" / "mm:ss" väärtus kujule "HH:MM:SS", et
// <input type="time" step="1"> seda kuvaks. Tühi / vigane → "".
export function toTimeInputValue(v: string | undefined | null): string {
  if (!v) return ""
  const p = String(v).trim().split(":")
  if (p.length < 2) return ""
  const h = String(parseInt(p[0] || "0", 10) || 0).padStart(2, "0")
  const m = String(parseInt(p[1] || "0", 10) || 0).padStart(2, "0")
  const s = String(parseInt(p[2] || "0", 10) || 0).padStart(2, "0")
  return `${h}:${m}:${s}`
}

type ClockProps = {
  value: string
  onChange: (v: string) => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  className?: string
  disabled?: boolean
}

export function TimeClockInput({ value, onChange, onKeyDown, className, disabled }: ClockProps) {
  return (
    <input
      type="time"
      step="1"
      value={toTimeInputValue(value)}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      className={className}
      disabled={disabled}
    />
  )
}
