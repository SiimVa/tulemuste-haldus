/** Keep decimal separators, signs and fractional zeroes while removing leading zeroes. */
export function normalizeNumericInput(value: string): string {
  return value.replace(/^([+-]?)0+(?=\d)/, "$1")
}

export function installNumericInputBehavior(root: Document): () => void {
  const decimalInProgress = new WeakSet<HTMLInputElement>()

  function numericInput(event: Event): HTMLInputElement | null {
    const input = event.target
    return input instanceof HTMLInputElement &&
      !input.readOnly && !input.disabled &&
      (input.type === "number" || (input.type === "text" && input.inputMode === "decimal"))
      ? input : null
  }

  function beforeInput(event: Event) {
    const input = numericInput(event)
    const edit = event as InputEvent
    if (!input || edit.isComposing) return
    // Number inputs can expose "0." as "0" while the separator is being edited.
    if (edit.inputType.startsWith("insert") && /[.,]/.test(edit.data ?? "")) {
      decimalInProgress.add(input)
      return
    }
    if (input.value === "0" && !decimalInProgress.has(input) &&
      edit.inputType.startsWith("insert") && edit.data && /^[0-9]+$/.test(edit.data)) {
      input.select()
    }
  }

  function onInput(event: Event) {
    const input = numericInput(event)
    if (!input || (event as InputEvent).isComposing) return
    const value = input.value
    if (value !== "0") decimalInProgress.delete(input)
    const normalized = normalizeNumericInput(value)
    if (value === normalized) return
    const cursor = input.selectionStart
    // Use the native setter so React's onChange still detects and receives the edit.
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
    setter?.call(input, normalized)
    if (cursor !== null) {
      const nextCursor = Math.max(0, cursor - (value.length - normalized.length))
      input.setSelectionRange(nextCursor, nextCursor)
    }
  }

  function onFocusOut(event: Event) {
    const input = numericInput(event)
    if (input) decimalInProgress.delete(input)
  }

  root.addEventListener("focusout", onFocusOut, true)
  root.addEventListener("beforeinput", beforeInput, true)
  root.addEventListener("input", onInput, true)
  return () => {
    root.removeEventListener("focusout", onFocusOut, true)
    root.removeEventListener("beforeinput", beforeInput, true)
    root.removeEventListener("input", onInput, true)
  }
}
