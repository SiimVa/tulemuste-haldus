import type { ReactNode } from "react"
import { Card } from "@/components/ui/card"
import { dashboardWidget, type DashboardWidgetId } from "@/lib/dashboard/config"
import { cn } from "@/lib/utils"

type WidgetFrameProps = {
  id: string
  title: string
  children: ReactNode
  actions?: ReactNode
  className?: string
  subtitle?: ReactNode
}

// Vidina kaart pealkirja, alapealkirja ja sisuga (ka üleriikliku arvestuse vidinad).
export function WidgetFrame({ id, title, children, actions, className, subtitle }: WidgetFrameProps) {
  const headingId = `widget-${id}-title`
  return (
    <Card className={cn("min-w-0 overflow-hidden", className)}>
      <section aria-labelledby={headingId} data-widget={id}>
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 id={headingId} className="font-semibold text-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p>}
          </div>
          {actions}
        </div>
        <div className="px-4 py-4 sm:px-5">{children}</div>
      </section>
    </Card>
  )
}

export function WidgetCard({ id, ...props }: Omit<WidgetFrameProps, "title" | "id"> & { id: DashboardWidgetId }) {
  return <WidgetFrame id={id} title={dashboardWidget(id).title} {...props} />
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="py-4 text-center text-sm text-ink-subtle">{children}</p>
}

// Laiad tabelid kerivad kaardi sees, mitte kogu lehte.
export function TableScroll({ children, maxHeight }: { children: ReactNode; maxHeight?: boolean }) {
  return (
    <div className={cn("-mx-4 overflow-x-auto sm:-mx-5", maxHeight && "max-h-[32rem] overflow-y-auto")}>
      <div className="min-w-full px-4 sm:px-5">{children}</div>
    </div>
  )
}

export const th = "whitespace-nowrap px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted first:pl-0"
export const td = "px-2 py-2 align-top first:pl-0"
export const tdNum = "px-2 py-2 text-right align-top tabular-nums"
