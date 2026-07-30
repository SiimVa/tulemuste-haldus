"use client"

import {
  type AllocationRuleDefinition,
  type AllocationRuleSource,
  type AllocationRuleType,
  type ClassBalanceMode,
} from "@/lib/registrationAllocation"
import type { FormFieldDefinition } from "@/lib/registrationForm"

type CompetitionClass = { id?: string; name: string }
type SourceOption = {
  key: string
  source: AllocationRuleSource
  fieldId: string | null
  fieldKey: string | null
  label: string
  values: { value: string; label: string }[]
}

function normalizedRules(rules: AllocationRuleDefinition[]) {
  return rules.map((rule, order) => ({ ...rule, order }))
}

function defaultLabel(type: AllocationRuleType) {
  return type === "GROUP_GUARANTEE"
    ? "Garanteeritud kohad grupi kohta"
    : "Prioriteetne grupp"
}

export function AllocationRuleBuilder({
  capacity,
  classes,
  fields,
  rules,
  classBalanceMode,
  onRulesChange,
  onClassBalanceModeChange,
}: {
  capacity: number | ""
  classes: CompetitionClass[]
  fields: FormFieldDefinition[]
  rules: AllocationRuleDefinition[]
  classBalanceMode: ClassBalanceMode
  onRulesChange: (rules: AllocationRuleDefinition[]) => void
  onClassBalanceModeChange: (mode: ClassBalanceMode) => void
}) {
  const sources: SourceOption[] = [
    ...(classes.length > 0
      ? [
          {
            key: "CLASS",
            source: "CLASS" as const,
            fieldId: null,
            fieldKey: null,
            label: "Võistlusklass",
            values: classes.flatMap((item) =>
              item.id ? [{ value: item.id, label: item.name }] : []
            ),
          },
        ]
      : []),
    ...fields
      .filter(
        (field) => field.type === "SELECT" && field.showInRegistration
      )
      .map((field) => ({
        key: `FIELD:${field.id ?? field.key}`,
        source: "FORM_FIELD" as const,
        fieldId: field.id ?? null,
        fieldKey: field.key,
        label: field.label,
        values: field.options.map((value) => ({ value, label: value })),
      })),
  ]

  function sourceFor(rule: AllocationRuleDefinition) {
    return sources.find((source) =>
      rule.source === "CLASS"
        ? source.source === "CLASS"
        : source.source === "FORM_FIELD" &&
          ((rule.fieldId && source.fieldId === rule.fieldId) ||
            (rule.fieldKey && source.fieldKey === rule.fieldKey))
    )
  }

  function updateRule(
    index: number,
    patch: Partial<AllocationRuleDefinition>
  ) {
    onRulesChange(
      normalizedRules(
        rules.map((rule, ruleIndex) =>
          ruleIndex === index ? { ...rule, ...patch } : rule
        )
      )
    )
  }

  function addRule(type: AllocationRuleType) {
    const source = sources[0]
    onRulesChange(
      normalizedRules([
        ...rules,
        {
          label: defaultLabel(type),
          type,
          source: source?.source ?? "FORM_FIELD",
          fieldId: source?.fieldId ?? null,
          fieldKey: source?.fieldKey ?? null,
          values: [],
          quota: type === "GROUP_GUARANTEE" ? 1 : null,
          order: rules.length,
        },
      ])
    )
  }

  function removeRule(index: number) {
    onRulesChange(
      normalizedRules(rules.filter((_, ruleIndex) => ruleIndex !== index))
    )
  }

  function moveRule(index: number, direction: -1 | 1) {
    const type = rules[index].type
    const sameTypeIndexes = rules.flatMap((rule, ruleIndex) =>
      rule.type === type ? [ruleIndex] : []
    )
    const position = sameTypeIndexes.indexOf(index)
    const target = sameTypeIndexes[position + direction]
    if (target === undefined) return
    const next = [...rules]
    ;[next[index], next[target]] = [next[target], next[index]]
    onRulesChange(normalizedRules(next))
  }

  function changeSource(index: number, sourceKey: string) {
    const source = sources.find(({ key }) => key === sourceKey)
    if (!source) return
    updateRule(index, {
      source: source.source,
      fieldId: source.fieldId,
      fieldKey: source.fieldKey,
      values: [],
    })
  }

  function toggleValue(index: number, value: string) {
    const selected = rules[index].values
    updateRule(index, {
      values: selected.includes(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value],
    })
  }

  function renderRules(type: AllocationRuleType) {
    const items = rules.flatMap((rule, index) =>
      rule.type === type ? [{ rule, index }] : []
    )
    return (
      <div className="space-y-3">
        {items.map(({ rule, index }, position) => {
          const source = sourceFor(rule)
          const appliesToAll =
            rule.type === "GROUP_GUARANTEE" && rule.values.length === 0
          return (
            <article key={rule.id ?? `new-rule-${index}`} className="border rounded-xl p-4 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <label className="text-xs text-gray-600 flex-1 min-w-52">
                  Reegli nimetus *
                  <input
                    value={rule.label}
                    maxLength={200}
                    onChange={(event) =>
                      updateRule(index, { label: event.target.value })
                    }
                    className="mt-1 w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </label>
                <div className="flex gap-1 pt-5">
                  <button
                    type="button"
                    onClick={() => moveRule(index, -1)}
                    disabled={position === 0}
                    aria-label="Liiguta reegel üles"
                    className="px-2 py-1 text-xs border rounded disabled:opacity-40"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveRule(index, 1)}
                    disabled={position === items.length - 1}
                    aria-label="Liiguta reegel alla"
                    className="px-2 py-1 text-xs border rounded disabled:opacity-40"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => removeRule(index)}
                    className="px-2 py-1 text-xs text-red-600 border border-red-200 rounded"
                  >
                    Eemalda
                  </button>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <label className="text-xs text-gray-600">
                  Rühmitamise alus *
                  <select
                    value={source?.key ?? ""}
                    onChange={(event) => changeSource(index, event.target.value)}
                    className="mt-1 w-full px-3 py-2 border rounded-lg text-sm"
                  >
                    <option value="">Vali registreerimisväli</option>
                    {sources.map((item) => (
                      <option key={item.key} value={item.key}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                {rule.type === "GROUP_GUARANTEE" && (
                  <label className="text-xs text-gray-600">
                    Garanteeritud kohti iga väärtuse kohta *
                    <input
                      type="number"
                      min={1}
                      max={10000}
                      step={1}
                      value={rule.quota ?? 1}
                      onChange={(event) =>
                        updateRule(index, {
                          quota: Number(event.target.value),
                        })
                      }
                      className="mt-1 w-full px-3 py-2 border rounded-lg text-sm"
                    />
                  </label>
                )}
              </div>

              {source && source.values.length > 0 && (
                <div>
                  <p className="text-xs text-gray-600 mb-2">
                    {rule.type === "GROUP_GUARANTEE"
                      ? "Väärtused (valimata jätmisel rakendub kõigile)"
                      : "Prioriteetsed väärtused *"}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {source.values.map((option) => (
                      <label
                        key={option.value}
                        className="inline-flex items-center gap-2 border rounded-lg px-3 py-2 text-sm cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={rule.values.includes(option.value)}
                          onChange={() => toggleValue(index, option.value)}
                          className="accent-blue-600"
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                  {appliesToAll && (
                    <p className="text-xs text-blue-600 mt-2">
                      Reegel rakendub igale registreerimisel kasutatud väärtusele.
                    </p>
                  )}
                </div>
              )}
            </article>
          )
        })}
        {sources.length === 0 ? (
          <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
            Lisa esmalt registreerimisvormile rippmenüü, näiteks „Maakond” või
            „Võistkonna liik”.
          </p>
        ) : (
          <button
            type="button"
            onClick={() => addRule(type)}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            + Lisa {type === "GROUP_GUARANTEE" ? "garantii" : "prioriteet"}
          </button>
        )}
      </div>
    )
  }

  return (
    <section className="bg-white border rounded-xl p-5 space-y-6">
      <div>
        <h2 className="font-semibold text-gray-900">
          Kohtade automaatne jaotamine
        </h2>
        <p className="text-xs text-gray-500 mt-1">
          Garantiid rakenduvad enne prioriteete. Prioriteedid rakenduvad
          allpool näidatud järjekorras ning ülejäänud kohad lähevad
          registreerimiskiiruse järgi.
        </p>
      </div>

      {capacity === "" && (
        <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
          Jaotusreeglid hakkavad mõjutama ootenimekirja pärast võistkondade
          üldarvu piirangu määramist.
        </p>
      )}

      <div>
        <h3 className="text-sm font-semibold text-gray-800 mb-1">
          1. Garanteeritud kohad
        </h3>
        <p className="text-xs text-gray-500 mb-3">
          Näiteks iga maakonna kümme kiiremat võistkonda.
        </p>
        {renderRules("GROUP_GUARANTEE")}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-800 mb-1">
          2. Prioriteedigrupid
        </h3>
        <p className="text-xs text-gray-500 mb-3">
          Ühes reeglis valitud väärtused on võrdsed. Eraldi reeglid
          rakenduvad ülevalt alla.
        </p>
        {renderRules("PRIORITY")}
      </div>

      <label className="flex items-start gap-3 cursor-pointer border-t pt-5">
        <input
          type="checkbox"
          checked={classBalanceMode === "BALANCED"}
          onChange={(event) =>
            onClassBalanceModeChange(
              event.target.checked ? "BALANCED" : "OFF"
            )
          }
          className="mt-1 accent-blue-600"
        />
        <span>
          <span className="text-sm font-medium text-gray-800">
            Tasakaalusta kohti klasside vahel
          </span>
          <span className="block text-xs text-gray-500 mt-1">
            Sama jaotusetapi sees eelistatakse klassi, millel on seni vähem
            kinnitatud kohti. Võrdse seisu korral otsustab registreerimisaeg.
          </span>
        </span>
      </label>

      <p className="text-xs text-gray-400">
        Kui garantiide summa ületab üldise kohtade arvu, jagatakse kohad
        gruppide vahel voorudena ja registreerimisaja alusel.
      </p>
    </section>
  )
}
