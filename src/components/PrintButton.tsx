"use client"

export function PrintButton({ label = "Prindi protokoll" }: { label?: string }) {
  return (
    <button
      onClick={() => window.print()}
      className="text-sm px-4 py-1.5 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium"
    >
      {label}
    </button>
  )
}
