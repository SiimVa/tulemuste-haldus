"use client"

import { Children, useEffect, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"

// Ekraanirežiim: näitab vidinaid ükshaaval ja värskendab andmeid iga 30 s järel.
export function ScreenRotator({ title, rotateSeconds, labels, children }: {
  title: string
  rotateSeconds: number
  labels: string[]
  children: ReactNode
}) {
  const slides = Children.toArray(children)
  const count = slides.length
  const router = useRouter()
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [clock, setClock] = useState("")
  const current = count > 0 ? Math.min(index, count - 1) : 0

  useEffect(() => {
    if (paused || count < 2) return
    const timer = setInterval(() => setIndex((value) => (value + 1) % count), rotateSeconds * 1000)
    return () => clearInterval(timer)
  }, [paused, count, rotateSeconds])

  useEffect(() => {
    const timer = setInterval(() => router.refresh(), 30_000)
    return () => clearInterval(timer)
  }, [router])

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString("et-EE", { hour: "2-digit", minute: "2-digit" }))
    tick()
    const timer = setInterval(tick, 10_000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (count === 0) return
      if (event.key === "ArrowRight") setIndex((value) => (Math.min(value, count - 1) + 1) % count)
      else if (event.key === "ArrowLeft") setIndex((value) => (Math.min(value, count - 1) - 1 + count) % count)
      else if (event.key === " ") { event.preventDefault(); setPaused((value) => !value) }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [count])

  const button = "min-h-11 min-w-11 rounded-lg border border-line bg-surface px-3 text-sm text-ink hover:bg-canvas"
  return (
    <div>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="min-w-0 text-xl font-bold text-ink sm:text-3xl">{title}</h1>
        <div className="flex items-center gap-2">
          <span className="mr-2 text-2xl font-semibold text-ink tabular-nums sm:text-3xl" aria-live="off">{clock}</span>
          {count > 1 && <>
            <button type="button" className={button} onClick={() => setIndex((current - 1 + count) % count)} aria-label="Eelmine vidin">←</button>
            <button type="button" className={button} onClick={() => setPaused((value) => !value)}>{paused ? "Jätka" : "Peata"}</button>
            <button type="button" className={button} onClick={() => setIndex((current + 1) % count)} aria-label="Järgmine vidin">→</button>
          </>}
        </div>
      </header>
      {count === 0 && <p className="py-16 text-center text-ink-muted">Ekraanile pole ühtegi vidinat valitud.</p>}
      {slides.map((slide, slideIndex) => (
        <div key={slideIndex} hidden={slideIndex !== current}>{slide}</div>
      ))}
      {count > 1 && (
        <nav aria-label="Vidinad" className="mt-2 flex flex-wrap justify-center">
          {labels.map((label, labelIndex) => (
            <button key={label} type="button" onClick={() => setIndex(labelIndex)} aria-current={labelIndex === current ? "true" : undefined}
              aria-label={label} title={label} className="group flex h-11 w-11 items-center justify-center">
              <span className={`h-3 w-3 rounded-full ${labelIndex === current ? "bg-primary" : "bg-line group-hover:bg-ink-subtle"}`} />
            </button>
          ))}
        </nav>
      )}
    </div>
  )
}
