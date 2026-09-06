import * as React from "react"
import { cn } from "@/lib/utils"

// Vormiväljade muster koodis on ühtne: px-3 py-2, hele äär, rounded-lg,
// text-sm ja sinine fookusrõngas. 76 välja kasutasid täpselt sama stringi.
// Disabled-olekut siin ei ole: valdav osa välju ei stiliseeri seda üldse ning
// need, mis stiliseerivad, kasutavad oma tausta (disabled:bg-gray-50 / -100).
const fieldClass =
  "w-full px-3 py-2 border border-line rounded-control text-sm focus:outline-none focus:ring-2 focus:ring-focus"

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(fieldClass, className)} {...props} />
))
Input.displayName = "Input"

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select ref={ref} className={cn(fieldClass, className)} {...props} />
))
Select.displayName = "Select"

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(fieldClass, className)} {...props} />
))
Textarea.displayName = "Textarea"

export { fieldClass }
