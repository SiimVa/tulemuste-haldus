"use client"

import {
  type FormFieldDefinition,
  type FormFieldType,
  type FormSemanticKey,
  MEMBER_FIELD_TYPES,
} from "@/lib/registrationForm"

const TYPE_LABEL: Record<FormFieldType, string> = {
  TEXT: "Lühike tekst",
  TEXTAREA: "Pikk tekst",
  NUMBER: "Arv",
  EMAIL: "E-post",
  PHONE: "Telefon",
  DATE: "Kuupäev",
  SELECT: "Rippmenüü",
  MULTISELECT: "Mitmikvalik",
  CHECKBOX: "Märkeruut",
  MEMBER_LIST: "Võistkonna liikmete loend",
}

const MEMBER_FIELD_LABEL = {
  name: "Nimi",
  email: "E-post",
  phone: "Telefon",
  birthDate: "Sünniaeg",
}

function newField(order: number): FormFieldDefinition {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replaceAll("-", "_")
      : `${Date.now()}_${order}`
  return {
    key: `custom_${suffix}`,
    label: "Uus väli",
    helpText: null,
    type: "TEXT",
    semanticKey: null,
    options: [],
    memberFields: ["name"],
    showInRegistration: true,
    requiredInRegistration: false,
    showInMandate: true,
    requiredInMandate: false,
    editableInMandate: true,
    conditionFieldKey: null,
    conditionOperator: null,
    conditionValue: null,
    order,
  }
}

export function FormBuilder({
  fields,
  onChange,
}: {
  fields: FormFieldDefinition[]
  onChange: (fields: FormFieldDefinition[]) => void
}) {
  function update(index: number, patch: Partial<FormFieldDefinition>) {
    onChange(
      fields.map((field, fieldIndex) =>
        fieldIndex === index ? { ...field, ...patch } : field
      )
    )
  }

  function remove(index: number) {
    onChange(
      fields
        .filter((_, fieldIndex) => fieldIndex !== index)
        .map((field, order) => ({ ...field, order }))
    )
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= fields.length) return
    const next = [...fields]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next.map((field, order) => ({ ...field, order })))
  }

  return (
    <section className="bg-white border rounded-xl p-5 space-y-5">
      <div>
        <h2 className="font-semibold text-gray-900">Registreerimisvorm</h2>
        <p className="text-xs text-gray-500 mt-1">
          Vali, milliseid andmeid küsitakse registreerimisel ja mandaadis.
          Registreerimisel sisestatud väärtused liiguvad mandaati kaasa.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="border rounded-lg p-3 bg-gray-50">
          <p className="text-sm font-medium text-gray-800">
            Võistkonna nimi *
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Süsteemne kohustuslik väli
          </p>
        </div>
        <div className="border rounded-lg p-3 bg-gray-50">
          <p className="text-sm font-medium text-gray-800">Klass *</p>
          <p className="text-xs text-gray-500 mt-1">
            Süsteemne rippmenüü klasside nimekirjast
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {fields.map((field, index) => {
          const previousFields = fields.slice(0, index).filter(
            (candidate) => candidate.type !== "MEMBER_LIST"
          )
          const conditionField = previousFields.find(
            ({ key }) => key === field.conditionFieldKey
          )
          return (
            <article key={field.key} className="border rounded-xl p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Väli {index + 1}
                </p>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    className="px-2 py-1 text-xs border rounded disabled:opacity-40"
                    aria-label="Liiguta üles"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === fields.length - 1}
                    className="px-2 py-1 text-xs border rounded disabled:opacity-40"
                    aria-label="Liiguta alla"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    className="px-2 py-1 text-xs text-red-600 border border-red-200 rounded"
                  >
                    Eemalda
                  </button>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <label className="text-xs text-gray-600">
                  Välja nimetus *
                  <input
                    value={field.label}
                    onChange={(event) =>
                      update(index, { label: event.target.value })
                    }
                    className="mt-1 w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </label>
                <label className="text-xs text-gray-600">
                  Välja tüüp
                  <select
                    value={field.type}
                    onChange={(event) => {
                      const type = event.target.value as FormFieldType
                      update(index, {
                        type,
                        semanticKey:
                          type === "SELECT" ? field.semanticKey : null,
                        options:
                          ["SELECT", "MULTISELECT"].includes(type) &&
                          field.options.length === 0
                            ? ["Valik 1"]
                            : field.options,
                        memberFields:
                          type === "MEMBER_LIST"
                            ? Array.from(
                                new Set(["name" as const, ...field.memberFields])
                              )
                            : ["name"],
                      })
                    }}
                    className="mt-1 w-full px-3 py-2 border rounded-lg text-sm"
                  >
                    {Object.entries(TYPE_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="text-xs text-gray-600 block">
                Abitekst
                <input
                  value={field.helpText ?? ""}
                  onChange={(event) =>
                    update(index, {
                      helpText: event.target.value || null,
                    })
                  }
                  placeholder="Selgita, mida siia sisestada"
                  className="mt-1 w-full px-3 py-2 border rounded-lg text-sm"
                />
              </label>

              {["SELECT", "MULTISELECT"].includes(field.type) && (
                <div>
                  <p className="text-xs text-gray-600 mb-2">Valikud *</p>
                  <div className="space-y-2">
                    {field.options.map((option, optionIndex) => (
                      <div key={optionIndex} className="flex gap-2">
                        <input
                          value={option}
                          onChange={(event) =>
                            update(index, {
                              options: field.options.map((item, itemIndex) =>
                                itemIndex === optionIndex
                                  ? event.target.value
                                  : item
                              ),
                            })
                          }
                          className="flex-1 px-3 py-2 border rounded-lg text-sm"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            update(index, {
                              options: field.options.filter(
                                (_, itemIndex) => itemIndex !== optionIndex
                              ),
                            })
                          }
                          className="px-2 text-xs text-red-600"
                        >
                          Eemalda
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      update(index, {
                        options: [
                          ...field.options,
                          `Valik ${field.options.length + 1}`,
                        ],
                      })
                    }
                    className="mt-2 text-xs text-blue-600"
                  >
                    + Lisa valik
                  </button>
                </div>
              )}

              {field.type === "SELECT" && (
                <label className="text-xs text-gray-600 block">
                  Tähendus kohtade jaotamisel
                  <select
                    value={field.semanticKey ?? ""}
                    onChange={(event) =>
                      update(index, {
                        semanticKey:
                          (event.target.value as FormSemanticKey) || null,
                      })
                    }
                    className="mt-1 w-full px-3 py-2 border rounded-lg text-sm"
                  >
                    <option value="">Ei mõjuta kohtade jaotamist</option>
                    <option value="COUNTY">Maakond</option>
                    <option value="TEAM_TYPE">Võistkonna liik</option>
                  </select>
                </label>
              )}

              {field.type === "MEMBER_LIST" && (
                <div>
                  <p className="text-xs text-gray-600 mb-2">
                    Iga liikme kohta küsitavad andmed
                  </p>
                  <div className="flex flex-wrap gap-4">
                    {MEMBER_FIELD_TYPES.map((memberField) => (
                      <label
                        key={memberField}
                        className="flex items-center gap-2 text-sm text-gray-700"
                      >
                        <input
                          type="checkbox"
                          checked={field.memberFields.includes(memberField)}
                          disabled={memberField === "name"}
                          onChange={(event) =>
                            update(index, {
                              memberFields: event.target.checked
                                ? [...field.memberFields, memberField]
                                : field.memberFields.filter(
                                    (item) => item !== memberField
                                  ),
                            })
                          }
                        />
                        {MEMBER_FIELD_LABEL[memberField]}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-4 border-t pt-4">
                <PhaseOptions
                  title="Registreerimisel"
                  shown={field.showInRegistration}
                  required={field.requiredInRegistration}
                  onShown={(value) =>
                    update(index, {
                      showInRegistration: value,
                      requiredInRegistration:
                        value && field.requiredInRegistration,
                    })
                  }
                  onRequired={(value) =>
                    update(index, { requiredInRegistration: value })
                  }
                />
                <PhaseOptions
                  title="Mandaadis"
                  shown={field.showInMandate}
                  required={field.requiredInMandate}
                  editable={field.editableInMandate}
                  onShown={(value) =>
                    update(index, {
                      showInMandate: value,
                      requiredInMandate: value && field.requiredInMandate,
                      editableInMandate: value && field.editableInMandate,
                    })
                  }
                  onRequired={(value) =>
                    update(index, { requiredInMandate: value })
                  }
                  onEditable={(value) =>
                    update(index, { editableInMandate: value })
                  }
                />
              </div>

              <div className="border-t pt-4">
                <label className="text-xs text-gray-600 block">
                  Tingimuslik kuvamine
                  <select
                    value={field.conditionFieldKey ?? ""}
                    onChange={(event) =>
                      update(index, {
                        conditionFieldKey: event.target.value || null,
                        conditionOperator: event.target.value
                          ? "EQUALS"
                          : null,
                        conditionValue: null,
                      })
                    }
                    className="mt-1 w-full px-3 py-2 border rounded-lg text-sm"
                  >
                    <option value="">Kuva alati</option>
                    {previousFields.map((candidate) => (
                      <option key={candidate.key} value={candidate.key}>
                        Kuva vastavalt väljale „{candidate.label}”
                      </option>
                    ))}
                  </select>
                </label>

                {field.conditionFieldKey && conditionField && (
                  <div className="grid sm:grid-cols-2 gap-3 mt-3">
                    <select
                      value={field.conditionOperator ?? "EQUALS"}
                      onChange={(event) =>
                        update(index, {
                          conditionOperator: event.target.value as
                            | "EQUALS"
                            | "NOT_EQUALS"
                            | "CONTAINS",
                        })
                      }
                      className="px-3 py-2 border rounded-lg text-sm"
                    >
                      <option value="EQUALS">on võrdne</option>
                      <option value="NOT_EQUALS">ei ole võrdne</option>
                      {conditionField.type === "MULTISELECT" && (
                        <option value="CONTAINS">sisaldab valikut</option>
                      )}
                    </select>
                    {["SELECT", "MULTISELECT"].includes(
                      conditionField.type
                    ) ? (
                      <select
                        value={field.conditionValue ?? ""}
                        onChange={(event) =>
                          update(index, {
                            conditionValue: event.target.value,
                          })
                        }
                        className="px-3 py-2 border rounded-lg text-sm"
                      >
                        <option value="">Vali väärtus...</option>
                        {conditionField.options.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : conditionField.type === "CHECKBOX" ? (
                      <select
                        value={field.conditionValue ?? ""}
                        onChange={(event) =>
                          update(index, {
                            conditionValue: event.target.value,
                          })
                        }
                        className="px-3 py-2 border rounded-lg text-sm"
                      >
                        <option value="">Vali väärtus...</option>
                        <option value="true">Märgitud</option>
                        <option value="false">Märkimata</option>
                      </select>
                    ) : (
                      <input
                        value={field.conditionValue ?? ""}
                        onChange={(event) =>
                          update(index, {
                            conditionValue: event.target.value,
                          })
                        }
                        placeholder="Oodatud väärtus"
                        className="px-3 py-2 border rounded-lg text-sm"
                      />
                    )}
                  </div>
                )}
              </div>
            </article>
          )
        })}
      </div>

      <button
        type="button"
        onClick={() => onChange([...fields, newField(fields.length)])}
        className="px-4 py-2 border border-blue-200 text-blue-700 rounded-lg text-sm hover:bg-blue-50"
      >
        + Lisa vormiväli
      </button>
    </section>
  )
}

function PhaseOptions({
  title,
  shown,
  required,
  editable,
  onShown,
  onRequired,
  onEditable,
}: {
  title: string
  shown: boolean
  required: boolean
  editable?: boolean
  onShown: (value: boolean) => void
  onRequired: (value: boolean) => void
  onEditable?: (value: boolean) => void
}) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-700 mb-2">{title}</p>
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={shown}
            onChange={(event) => onShown(event.target.checked)}
          />
          Kuva väli
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={required}
            disabled={!shown}
            onChange={(event) => onRequired(event.target.checked)}
          />
          Kohustuslik
        </label>
        {onEditable && (
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={Boolean(editable)}
              disabled={!shown}
              onChange={(event) => onEditable(event.target.checked)}
            />
            Mandaadis muudetav
          </label>
        )}
      </div>
    </div>
  )
}
