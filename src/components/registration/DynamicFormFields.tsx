"use client"

import {
  defaultFormAnswer,
  type FormAnswer,
  type FormAnswers,
  type FormFieldDefinition,
  type FormPhase,
  isFormFieldVisible,
  type MemberAnswer,
} from "@/lib/registrationForm"

function valueFor(
  field: FormFieldDefinition,
  values: FormAnswers
): FormAnswer {
  return values[field.key] ?? defaultFormAnswer(field)
}

export function DynamicFormFields({
  fields,
  phase,
  values,
  onChange,
  errors = {},
  disabled = false,
}: {
  fields: FormFieldDefinition[]
  phase: FormPhase
  values: FormAnswers
  onChange: (key: string, value: FormAnswer) => void
  errors?: Record<string, string>
  disabled?: boolean
}) {
  const visibleFields = [...fields]
    .sort((a, b) => a.order - b.order)
    .filter((field) => {
      const shown =
        phase === "REGISTRATION"
          ? field.showInRegistration
          : field.showInMandate
      return shown && isFormFieldVisible(field, values)
    })

  return (
    <div className="space-y-4">
      {visibleFields.map((field) => {
        const required =
          phase === "REGISTRATION"
            ? field.requiredInRegistration
            : field.requiredInMandate
        const fieldDisabled =
          disabled || (phase === "MANDATE" && !field.editableInMandate)
        const value = valueFor(field, values)
        const inputId = `dynamic-field-${field.key}`

        return (
          <div key={field.key}>
            {field.type !== "CHECKBOX" && (
              <label
                htmlFor={inputId}
                className="text-sm font-medium text-gray-700 mb-1 block"
              >
                {field.label}
                {required ? " *" : ""}
              </label>
            )}
            {field.helpText && (
              <p className="text-xs text-gray-500 mb-2">{field.helpText}</p>
            )}

            {field.type === "TEXT" && (
              <input
                id={inputId}
                type="text"
                value={typeof value === "string" ? value : ""}
                onChange={(event) => onChange(field.key, event.target.value)}
                disabled={fieldDisabled}
                className="w-full px-3 py-2 border rounded-lg text-sm disabled:bg-gray-50"
              />
            )}
            {field.type === "TEXTAREA" && (
              <textarea
                id={inputId}
                rows={4}
                value={typeof value === "string" ? value : ""}
                onChange={(event) => onChange(field.key, event.target.value)}
                disabled={fieldDisabled}
                className="w-full px-3 py-2 border rounded-lg text-sm disabled:bg-gray-50"
              />
            )}
            {field.type === "NUMBER" && (
              <input
                id={inputId}
                type="number"
                value={
                  typeof value === "number" || typeof value === "string"
                    ? value
                    : ""
                }
                onChange={(event) => onChange(field.key, event.target.value)}
                disabled={fieldDisabled}
                className="w-full px-3 py-2 border rounded-lg text-sm disabled:bg-gray-50"
              />
            )}
            {field.type === "EMAIL" && (
              <input
                id={inputId}
                type="email"
                value={typeof value === "string" ? value : ""}
                onChange={(event) => onChange(field.key, event.target.value)}
                disabled={fieldDisabled}
                className="w-full px-3 py-2 border rounded-lg text-sm disabled:bg-gray-50"
              />
            )}
            {field.type === "PHONE" && (
              <input
                id={inputId}
                type="tel"
                value={typeof value === "string" ? value : ""}
                onChange={(event) => onChange(field.key, event.target.value)}
                disabled={fieldDisabled}
                className="w-full px-3 py-2 border rounded-lg text-sm disabled:bg-gray-50"
              />
            )}
            {field.type === "DATE" && (
              <input
                id={inputId}
                type="date"
                value={typeof value === "string" ? value : ""}
                onChange={(event) => onChange(field.key, event.target.value)}
                disabled={fieldDisabled}
                className="w-full px-3 py-2 border rounded-lg text-sm disabled:bg-gray-50"
              />
            )}
            {field.type === "SELECT" && (
              <select
                id={inputId}
                value={typeof value === "string" ? value : ""}
                onChange={(event) => onChange(field.key, event.target.value)}
                disabled={fieldDisabled}
                className="w-full px-3 py-2 border rounded-lg text-sm disabled:bg-gray-50"
              >
                <option value="">Vali...</option>
                {field.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            )}
            {field.type === "MULTISELECT" && (
              <div className="space-y-2 border rounded-lg px-3 py-2">
                {field.options.map((option) => {
                  const selected = Array.isArray(value)
                    ? value.filter(
                        (item): item is string => typeof item === "string"
                      )
                    : []
                  return (
                    <label
                      key={option}
                      className="flex items-center gap-2 text-sm text-gray-700"
                    >
                      <input
                        type="checkbox"
                        checked={selected.includes(option)}
                        disabled={fieldDisabled}
                        onChange={(event) =>
                          onChange(
                            field.key,
                            event.target.checked
                              ? [...selected, option]
                              : selected.filter((item) => item !== option)
                          )
                        }
                      />
                      {option}
                    </label>
                  )
                })}
              </div>
            )}
            {field.type === "CHECKBOX" && (
              <label className="flex items-start gap-2 text-sm text-gray-700">
                <input
                  id={inputId}
                  type="checkbox"
                  checked={value === true}
                  disabled={fieldDisabled}
                  onChange={(event) =>
                    onChange(field.key, event.target.checked)
                  }
                  className="mt-0.5"
                />
                <span>
                  {field.label}
                  {required ? " *" : ""}
                </span>
              </label>
            )}
            {field.type === "MEMBER_LIST" && (
              <MemberListInput
                field={field}
                value={
                  Array.isArray(value)
                    ? value.filter(
                        (item): item is MemberAnswer =>
                          typeof item === "object" && item !== null
                      )
                    : []
                }
                disabled={fieldDisabled}
                onChange={(members) => onChange(field.key, members)}
              />
            )}

            {errors[field.key] && (
              <p className="text-xs text-red-600 mt-1">{errors[field.key]}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}

function MemberListInput({
  field,
  value,
  disabled,
  onChange,
}: {
  field: FormFieldDefinition
  value: MemberAnswer[]
  disabled: boolean
  onChange: (members: MemberAnswer[]) => void
}) {
  function update(index: number, patch: Partial<MemberAnswer>) {
    onChange(
      value.map((member, memberIndex) =>
        memberIndex === index ? { ...member, ...patch } : member
      )
    )
  }

  return (
    <div className="space-y-3">
      {value.map((member, index) => (
        <div key={index} className="border rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-gray-500">
              Liige {index + 1}
            </p>
            {!disabled && (
              <button
                type="button"
                onClick={() =>
                  onChange(
                    value.filter((_, memberIndex) => memberIndex !== index)
                  )
                }
                className="text-xs text-red-600 hover:underline"
              >
                Eemalda
              </button>
            )}
          </div>
          <input
            aria-label={`Liige ${index + 1} nimi`}
            placeholder="Ees- ja perekonnanimi"
            value={member.name}
            disabled={disabled}
            onChange={(event) => update(index, { name: event.target.value })}
            className="w-full px-3 py-2 border rounded-lg text-sm disabled:bg-gray-50"
          />
          <div className="grid sm:grid-cols-2 gap-2">
            {field.memberFields.includes("email") && (
              <input
                type="email"
                aria-label={`Liige ${index + 1} e-post`}
                placeholder="E-post"
                value={member.email ?? ""}
                disabled={disabled}
                onChange={(event) =>
                  update(index, { email: event.target.value })
                }
                className="px-3 py-2 border rounded-lg text-sm disabled:bg-gray-50"
              />
            )}
            {field.memberFields.includes("phone") && (
              <input
                type="tel"
                aria-label={`Liige ${index + 1} telefon`}
                placeholder="Telefon"
                value={member.phone ?? ""}
                disabled={disabled}
                onChange={(event) =>
                  update(index, { phone: event.target.value })
                }
                className="px-3 py-2 border rounded-lg text-sm disabled:bg-gray-50"
              />
            )}
            {field.memberFields.includes("birthDate") && (
              <label className="text-xs text-gray-500">
                Sünniaeg
                <input
                  type="date"
                  aria-label={`Liige ${index + 1} sünniaeg`}
                  value={member.birthDate ?? ""}
                  disabled={disabled}
                  onChange={(event) =>
                    update(index, { birthDate: event.target.value })
                  }
                  className="mt-1 w-full px-3 py-2 border rounded-lg text-sm disabled:bg-gray-50"
                />
              </label>
            )}
          </div>
        </div>
      ))}
      {!disabled && (
        <button
          type="button"
          onClick={() => onChange([...value, { name: "" }])}
          className="px-3 py-2 border rounded-lg text-sm hover:bg-gray-50"
        >
          + Lisa liige
        </button>
      )}
    </div>
  )
}
