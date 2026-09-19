"use client"

import { useEffect, useState } from "react"
import { defaultTieBreakConfig, tieBreakLabels, type TieBreakConfig, type TieBreakElement } from "@/lib/tieBreak"
import { useRouter } from "next/navigation"

type Team = { id: string; code: string; name: string; class: string | null }
export function TieBreakSettings({ competitionId }: { competitionId: string }) {
  const router = useRouter()
  const [config, setConfig] = useState<TieBreakConfig>(defaultTieBreakConfig)
  const [elements, setElements] = useState<TieBreakElement[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  useEffect(() => {
    let current = true
    fetch(`/api/competitions/${competitionId}/tie-break`).then(async response => {
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? "Seadete laadimine ebaõnnestus.")
      if (!current) return
      setConfig(data.config); setElements(data.elements); setTeams(data.teams); setLoaded(true)
    }).catch(error => { if (current) setMessage(error.message) })
    return () => { current = false }
  }, [competitionId])
  function change(next: TieBreakConfig) { setConfig(next); setMessage("") }
  function ruleChange(index: number, patch: Partial<TieBreakConfig["rules"][number]>) {
    change({ ...config, rules: config.rules.map((rule, i) => i === index ? { ...rule, ...patch } : rule) })
  }
  function move(index: number, direction: number) {
    const rules = [...config.rules]
    ;[rules[index], rules[index + direction]] = [rules[index + direction], rules[index]]
    change({ ...config, rules })
  }
  async function save() {
    setSaving(true); setMessage("")
    try {
      const response = await fetch(`/api/competitions/${competitionId}/tie-break`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? "Salvestamine ebaõnnestus.")
      setMessage("Viigilahutuse seaded salvestatud."); router.refresh()
    } catch (error) { setMessage(error instanceof Error ? error.message : "Salvestamine ebaõnnestus.") }
    finally { setSaving(false) }
  }
  const selected = config.elementIds ?? elements.filter(el => el.type === "CHECKPOINT" && !el.isCancelled).map(el => el.id)
  return <section className="mt-6 rounded-xl border bg-white p-5 space-y-4" aria-label="Viigilahutuse seaded">
    <h2 className="text-lg font-semibold">Võrdsete punktide viigilahutus</h2>
    <p className="text-sm text-gray-500">Rakendub ainult võrdsele koguskoorile. Kõrgemal olev aktiivne reegel otsustab esimesena. Lahendamata viigid saavad jagatud koha (1, 1, 3). Üld- ja klassiarvestus arvutatakse eraldi.</p>
    <fieldset disabled={!loaded || saving} className="space-y-4">
      <label className="flex items-center gap-2"><input type="checkbox" checked={config.enabled} onChange={event => change({ ...config, enabled: event.target.checked })} />Lülita viigilahutus sisse</label>
      {config.enabled && <>
        <fieldset className="rounded border p-3 space-y-2">
          <legend className="px-1 font-medium">Kohtade võrdlemise elemendid</legend>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={config.elementIds === null} onChange={event => change({ ...config, elementIds: event.target.checked ? null : selected })} />Kõik kontrollpunktid (vaikimisi)</label>
          {config.elementIds !== null && elements.filter(el => !el.isCancelled).map(el => <label key={el.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={selected.includes(el.id)} onChange={event => change({ ...config, elementIds: event.target.checked ? [...selected, el.id] : selected.filter(id => id !== el.id) })} />{el.code} · {el.name}
          </label>)}
          <p className="text-xs text-gray-500">Kohti võrreldakse elemendi lõpp-punktide järgi. Võrdne tulemus annab võrdse koha. Kui viigis võistkonnal puudub vajalik tulemus, jäetakse see reegel selles viigigrupis vahele. Tühistatud elemendid ei osale.</p>
        </fieldset>
        <ol className="space-y-3">
          {config.rules.map((rule, index) => <li key={rule.kind} className="rounded border p-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-gray-500">{index + 1}.</span>
              <label className="flex flex-1 items-center gap-2"><input type="checkbox" checked={rule.enabled} onChange={event => ruleChange(index, { enabled: event.target.checked })} />{tieBreakLabels[rule.kind]}</label>
              <button type="button" disabled={index === 0} onClick={() => move(index, -1)} className="rounded border px-2 disabled:opacity-30" aria-label={`${tieBreakLabels[rule.kind]} üles`}>↑</button>
              <button type="button" disabled={index === config.rules.length - 1} onClick={() => move(index, 1)} className="rounded border px-2 disabled:opacity-30" aria-label={`${tieBreakLabels[rule.kind]} alla`}>↓</button>
            </div>
            {rule.enabled && rule.kind === "PREFERRED_ELEMENT" && <label className="block text-sm">Eelistatud element
              <select className="mt-1 block w-full rounded border p-2" value={rule.elementId ?? ""} onChange={event => ruleChange(index, { elementId: event.target.value })}>
                <option value="">Vali element</option>{elements.filter(el => !el.isCancelled).map(el => <option key={el.id} value={el.id}>{el.code} · {el.name}</option>)}
              </select>
            </label>}
            {rule.enabled && rule.kind === "FEWER_PENALTIES" && <p className="text-xs text-gray-500">Võrreldakse eraldi lisatud lisakaristuspunktide summat. Elementide erandeid ei loeta teist korda.</p>}
            {rule.enabled && rule.kind === "MANUAL" && <div className="space-y-2">
              <label className="block text-sm">Avalik põhjendus<textarea className="mt-1 w-full rounded border p-2" maxLength={500} value={rule.reason ?? ""} onChange={event => ruleChange(index, { reason: event.target.value })} /></label>
              <p className="text-xs text-gray-500">Ülemine võistkond on eelistatud. Valimata võistkonnad jäävad nende taha omavahel viiki. Järjekord ei ületa kogupunkte ega eespool olevaid reegleid.</p>
              {(rule.teamOrder ?? []).map((id, position) => <div key={id} className="flex items-center gap-2 text-sm">
                <span className="flex-1">{position + 1}. {teams.find(team => team.id === id)?.name ?? "Kustutatud võistkond"}</span>
                <button type="button" disabled={position === 0} className="rounded border px-2 disabled:opacity-30" aria-label={`Võistkond ${position + 1} üles`} onClick={() => {
                  const order = [...(rule.teamOrder ?? [])]; [order[position], order[position - 1]] = [order[position - 1], order[position]]; ruleChange(index, { teamOrder: order })
                }}>↑</button>
                <button type="button" className="text-red-600" onClick={() => ruleChange(index, { teamOrder: rule.teamOrder?.filter(teamId => teamId !== id) })}>Eemalda</button>
              </div>)}
              <label className="block text-sm">Lisa võistkond järjekorda<select className="mt-1 block w-full rounded border p-2" value="" onChange={event => { if (event.target.value) ruleChange(index, { teamOrder: [...(rule.teamOrder ?? []), event.target.value] }) }}>
                <option value="">Vali võistkond</option>{teams.filter(team => !rule.teamOrder?.includes(team.id)).map(team => <option key={team.id} value={team.id}>{team.code} · {team.name}{team.class ? ` (${team.class})` : ""}</option>)}
              </select></label>
            </div>}
          </li>)}
        </ol>
      </>}
      <button type="button" onClick={save} className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50">{saving ? "Salvestan…" : "Salvesta viigilahutus"}</button>
    </fieldset>
    {message && <p role="status" className="text-sm">{message}</p>}
  </section>
}
