import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

// Sildi muster koodis: text-xs, rounded-full, pehme taust + tume tekst.
const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
  {
    variants: {
      tone: {
        neutral: "bg-canvas text-ink-muted",
        info: "bg-primary-soft text-primary-hover",
        success: "bg-success-soft text-success",
        warning: "bg-warning-soft text-warning",
        danger: "bg-danger-soft text-danger-hover",
      },
    },
    defaultVariants: { tone: "neutral" },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />
}

export { badgeVariants }
