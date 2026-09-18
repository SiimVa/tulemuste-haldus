"use client"

import { useEffect } from "react"
import { installNumericInputBehavior } from "@/lib/numericInput"

export function NumericInputBehavior() {
  useEffect(() => installNumericInputBehavior(document), [])
  return null
}
