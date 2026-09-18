import type { Metadata } from "next"
import { NumericInputBehavior } from "@/components/NumericInputBehavior"
import "./globals.css"

export const metadata: Metadata = {
  title: "Võistluste tulemuste haldus",
  description: "Patrullvõistluse tulemuste haldussüsteem",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="et">
      <body className="font-sans">
        <NumericInputBehavior />
        {children}
      </body>
    </html>
  )
}
