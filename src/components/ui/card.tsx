import * as React from "react"
import { cn } from "@/lib/utils"

// Kaardi muster koodis on ühtne: bg-white + border + rounded-xl.
// cardClass on nende elementide jaoks, mis ei ole div — koodis on 23 sellist
// kaarti (section, form, article, details, p).
export const cardClass = "bg-surface border border-line rounded-card"

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(cardClass, className)} {...props} />
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 py-4 border-b border-line", className)} {...props} />
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("font-semibold text-ink", className)} {...props} />
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 py-4", className)} {...props} />
}
