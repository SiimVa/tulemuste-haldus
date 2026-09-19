export function TieBreakReason({ overall, withinClass }: { overall?: string | null; withinClass?: string | null }) {
  if (!overall && !withinClass) return null
  return <div className="mt-1 max-w-sm space-y-1 text-xs font-normal text-gray-500 whitespace-normal">
    {overall && <p>Üld: {overall}</p>}
    {withinClass && <p>Klass: {withinClass}</p>}
  </div>
}
