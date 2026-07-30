import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { canAccessCompetition } from "@/lib/competitionAccess"
import {
  getCompetitionMandateStatus,
  getCompetitionRegistrationStatus,
  isPhaseOverride,
  validatePhaseWindow,
} from "@/lib/competitionPhases"
import { prisma } from "@/lib/prisma"
import {
  type AllocationRuleDefinition,
  isAllocationRuleSource,
  isAllocationRuleType,
  isClassBalanceMode,
} from "@/lib/registrationAllocation"
import { recalculateRegistrationAllocation } from "@/lib/registrationAllocation.server"
import {
  type FormFieldDefinition,
  FORM_FIELD_TYPES,
  FORM_SEMANTIC_KEYS,
  isFormConditionOperator,
  isFormFieldType,
  isFormSemanticKey,
  MEMBER_FIELD_TYPES,
  toFormFieldDefinition,
} from "@/lib/registrationForm"

const formFieldSelect = {
  id: true,
  key: true,
  label: true,
  helpText: true,
  type: true,
  semanticKey: true,
  options: true,
  memberFields: true,
  showInRegistration: true,
  requiredInRegistration: true,
  showInMandate: true,
  requiredInMandate: true,
  editableInMandate: true,
  conditionFieldKey: true,
  conditionOperator: true,
  conditionValue: true,
  order: true,
}

const allocationRuleSelect = {
  id: true,
  label: true,
  type: true,
  source: true,
  fieldId: true,
  values: true,
  quota: true,
  order: true,
}

function parseStoredValues(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : []
  } catch {
    return []
  }
}

function toAllocationRuleDefinition(rule: {
  id: string
  label: string
  type: string
  source: string
  fieldId: string | null
  values: string
  quota: number | null
  order: number
}): AllocationRuleDefinition | null {
  if (!isAllocationRuleType(rule.type) || !isAllocationRuleSource(rule.source)) {
    return null
  }
  return {
    ...rule,
    type: rule.type,
    source: rule.source,
    values: parseStoredValues(rule.values),
  }
}

function parseAllocationRules(value: unknown): AllocationRuleDefinition[] {
  if (!Array.isArray(value)) {
    throw new Error("Kohtade jaotamise reeglite nimekiri puudub")
  }
  if (value.length > 50) {
    throw new Error("Ühel võistlusel saab olla kuni 50 jaotusreeglit")
  }
  return value.map((item: unknown, order): AllocationRuleDefinition => {
    if (!item || typeof item !== "object") {
      throw new Error("Vigane kohtade jaotamise reegel")
    }
    const raw = item as Record<string, unknown>
    const label = typeof raw.label === "string" ? raw.label.trim() : ""
    if (!label || label.length > 200) {
      throw new Error("Jaotusreegli nimetus on kohustuslik")
    }
    if (!isAllocationRuleType(raw.type)) {
      throw new Error(`Reegli „${label}” tüüp on vigane`)
    }
    if (!isAllocationRuleSource(raw.source)) {
      throw new Error(`Reegli „${label}” alus on vigane`)
    }
    const fieldId =
      raw.source === "FORM_FIELD" && typeof raw.fieldId === "string"
        ? raw.fieldId
        : null
    const fieldKey =
      raw.source === "FORM_FIELD" && typeof raw.fieldKey === "string"
        ? raw.fieldKey
        : null
    if (raw.source === "FORM_FIELD" && !fieldId && !fieldKey) {
      throw new Error(`Reeglile „${label}” tuleb valida vormiväli`)
    }
    const values = Array.isArray(raw.values)
      ? raw.values.map((entry) =>
          typeof entry === "string" ? entry.trim() : ""
        )
      : []
    if (
      values.some((entry) => !entry || entry.length > 200) ||
      new Set(values).size !== values.length
    ) {
      throw new Error(`Kontrolli reegli „${label}” väärtusi`)
    }
    if (raw.type === "PRIORITY" && values.length === 0) {
      throw new Error(`Prioriteedireeglile „${label}” tuleb valida väärtus`)
    }
    const quota =
      raw.type === "GROUP_GUARANTEE" ? Number(raw.quota) : null
    if (
      raw.type === "GROUP_GUARANTEE" &&
      (!Number.isInteger(quota) || quota === null || quota < 1 || quota > 10000)
    ) {
      throw new Error(`Reegli „${label}” kohtade arv peab olema täisarv`)
    }
    return {
      id: typeof raw.id === "string" ? raw.id : undefined,
      label,
      type: raw.type,
      source: raw.source,
      fieldId,
      fieldKey,
      values,
      quota,
      order,
    }
  })
}

function optionalDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null
  if (typeof value !== "string") throw new Error("Vigane kuupäev")
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) throw new Error("Vigane kuupäev")
  return date
}

function responseData<
  T extends {
    registrationOverride: string
    registrationOpensAt: Date | null
    registrationClosesAt: Date | null
    registrationFinalizedAt: Date | null
    mandateOverride: string
    mandateOpensAt: Date | null
    mandateClosesAt: Date | null
    mandateFinalizedAt: Date | null
  },
>(competition: T) {
  return {
    ...competition,
    registrationStatus: getCompetitionRegistrationStatus(competition),
    mandateStatus: getCompetitionMandateStatus(competition),
  }
}

function parseFormFields(value: unknown): FormFieldDefinition[] {
  if (!Array.isArray(value)) throw new Error("Vormiväljade nimekiri puudub")
  if (value.length > 100) {
    throw new Error("Ühel võistlusel saab olla kuni 100 vormivälja")
  }

  const fields = value.map((item: unknown, order): FormFieldDefinition => {
    if (!item || typeof item !== "object") throw new Error("Vigane vormiväli")
    const raw = item as Record<string, unknown>
    const id = typeof raw.id === "string" ? raw.id : undefined
    const key = typeof raw.key === "string" ? raw.key.trim() : ""
    const label = typeof raw.label === "string" ? raw.label.trim() : ""
    const helpText =
      typeof raw.helpText === "string" && raw.helpText.trim()
        ? raw.helpText.trim()
        : null
    if (!/^[a-z][a-z0-9_-]{2,79}$/.test(key)) {
      throw new Error("Vormivälja tehniline võti on vigane")
    }
    if (!label || label.length > 200 || (helpText?.length ?? 0) > 1000) {
      throw new Error("Kontrolli vormivälja nimetust ja abiteksti")
    }
    if (!isFormFieldType(raw.type)) {
      throw new Error(
        `Välja „${label}” tüüp peab olema üks järgmistest: ${FORM_FIELD_TYPES.join(", ")}`
      )
    }

    const semanticKey =
      raw.semanticKey === null || raw.semanticKey === ""
        ? null
        : isFormSemanticKey(raw.semanticKey)
          ? raw.semanticKey
          : undefined
    if (semanticKey === undefined) {
      throw new Error(
        `Välja „${label}” tähendus peab olema üks järgmistest: ${FORM_SEMANTIC_KEYS.join(", ")}`
      )
    }

    const options = Array.isArray(raw.options)
      ? raw.options.map((option) =>
          typeof option === "string" ? option.trim() : ""
        )
      : []
    if (
      options.some((option) => !option || option.length > 200) ||
      new Set(options.map((option) => option.toLocaleLowerCase("et"))).size !==
        options.length ||
      options.length > 200
    ) {
      throw new Error(`Kontrolli välja „${label}” valikuid`)
    }
    if (
      ["SELECT", "MULTISELECT"].includes(raw.type) &&
      options.length === 0
    ) {
      throw new Error(`Väljale „${label}” tuleb lisada vähemalt üks valik`)
    }
    if (semanticKey && raw.type !== "SELECT") {
      throw new Error(
        `Kohtade jaotamise väli „${label}” peab olema rippmenüü`
      )
    }

    const memberFields = Array.isArray(raw.memberFields)
      ? raw.memberFields.filter(
          (memberField): memberField is (typeof MEMBER_FIELD_TYPES)[number] =>
            typeof memberField === "string" &&
            MEMBER_FIELD_TYPES.includes(
              memberField as (typeof MEMBER_FIELD_TYPES)[number]
            )
        )
      : []
    const normalizedMemberFields =
      raw.type === "MEMBER_LIST"
        ? Array.from(new Set(["name" as const, ...memberFields]))
        : ["name" as const]

    const showInRegistration = Boolean(raw.showInRegistration)
    const showInMandate = Boolean(raw.showInMandate)
    if (!showInRegistration && !showInMandate) {
      throw new Error(
        `Väli „${label}” peab olema nähtav registreerimisel või mandaadis`
      )
    }
    if (
      showInMandate &&
      !showInRegistration &&
      !Boolean(raw.editableInMandate)
    ) {
      throw new Error(
        `Ainult mandaadis kuvatav väli „${label}” peab olema muudetav`
      )
    }

    const conditionFieldKey =
      typeof raw.conditionFieldKey === "string" && raw.conditionFieldKey
        ? raw.conditionFieldKey
        : null
    const conditionOperator = conditionFieldKey
      ? isFormConditionOperator(raw.conditionOperator)
        ? raw.conditionOperator
        : undefined
      : null
    if (conditionOperator === undefined) {
      throw new Error(`Välja „${label}” kuvamistingimus on vigane`)
    }

    return {
      id,
      key,
      label,
      helpText,
      type: raw.type,
      semanticKey,
      options,
      memberFields: normalizedMemberFields,
      showInRegistration,
      requiredInRegistration:
        showInRegistration && Boolean(raw.requiredInRegistration),
      showInMandate,
      requiredInMandate: showInMandate && Boolean(raw.requiredInMandate),
      editableInMandate:
        showInMandate && Boolean(raw.editableInMandate),
      conditionFieldKey,
      conditionOperator,
      conditionValue:
        conditionFieldKey && typeof raw.conditionValue === "string"
          ? raw.conditionValue
          : null,
      order,
    }
  })

  const keys = fields.map(({ key }) => key)
  if (new Set(keys).size !== keys.length) {
    throw new Error("Vormiväljade tehnilised võtmed peavad olema erinevad")
  }
  const semanticKeys = fields
    .map(({ semanticKey }) => semanticKey)
    .filter((key): key is NonNullable<typeof key> => Boolean(key))
  if (new Set(semanticKeys).size !== semanticKeys.length) {
    throw new Error(
      "Maakonna ja võistkonna liigi tähendusega välja saab lisada ühe korra"
    )
  }
  for (const [index, field] of fields.entries()) {
    if (
      field.conditionFieldKey &&
      !fields
        .slice(0, index)
        .some(({ key }) => key === field.conditionFieldKey)
    ) {
      throw new Error(
        `Välja „${field.label}” tingimus peab viitama varasemale väljale`
      )
    }
  }
  return fields
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const actor = session.user

  const { id } = await params
  const allowed = await canAccessCompetition(id, {
    id: actor.id,
    role: actor.role,
  })
  if (!allowed) {
    return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  }

  const competition = await prisma.competition.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      isPublic: true,
      registrationOpensAt: true,
      registrationClosesAt: true,
      registrationOverride: true,
      registrationFinalizedAt: true,
      registrationCapacity: true,
      registrationClassBalanceMode: true,
      mandateOpensAt: true,
      mandateClosesAt: true,
      mandateOverride: true,
      mandateFinalizedAt: true,
      registrationClasses: {
        where: { isActive: true },
        orderBy: [{ order: "asc" }, { name: "asc" }],
        select: { id: true, name: true, order: true },
      },
      registrationFormFields: {
        where: { isActive: true },
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        select: formFieldSelect,
      },
      registrationAllocationRules: {
        where: { isActive: true },
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        select: allocationRuleSelect,
      },
      _count: {
        select: { registrationApplications: true },
      },
    },
  })
  if (!competition) {
    return NextResponse.json({ error: "Võistlust ei leitud" }, { status: 404 })
  }

  return NextResponse.json({
    ...responseData(competition),
    registrationFormFields: competition.registrationFormFields.map(
      toFormFieldDefinition
    ),
    registrationAllocationRules:
      competition.registrationAllocationRules.flatMap((rule) => {
        const definition = toAllocationRuleDefinition(rule)
        return definition ? [definition] : []
      }),
  })
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const actor = session.user

  const { id } = await params
  const allowed = await canAccessCompetition(id, {
    id: actor.id,
    role: actor.role,
  })
  if (!allowed) {
    return NextResponse.json({ error: "Keelatud" }, { status: 403 })
  }

  try {
    const body = await req.json()
    if (
      !isPhaseOverride(body.registrationOverride) ||
      !isPhaseOverride(body.mandateOverride)
    ) {
      return NextResponse.json(
        { error: "Vigane käsitsi juhtimise valik" },
        { status: 400 }
      )
    }

    const registrationOpensAt = optionalDate(body.registrationOpensAt)
    const registrationClosesAt = optionalDate(body.registrationClosesAt)
    const mandateOpensAt = optionalDate(body.mandateOpensAt)
    const mandateClosesAt = optionalDate(body.mandateClosesAt)

    if (!validatePhaseWindow(registrationOpensAt, registrationClosesAt)) {
      return NextResponse.json(
        { error: "Registreerimise algus peab olema lõpust varasem" },
        { status: 400 }
      )
    }
    if (!validatePhaseWindow(mandateOpensAt, mandateClosesAt)) {
      return NextResponse.json(
        { error: "Mandaadi algus peab olema lõpust varasem" },
        { status: 400 }
      )
    }

    let registrationCapacity: number | null = null
    if (
      body.registrationCapacity !== null &&
      body.registrationCapacity !== undefined &&
      body.registrationCapacity !== ""
    ) {
      registrationCapacity = Number(body.registrationCapacity)
      if (
        !Number.isInteger(registrationCapacity) ||
        registrationCapacity < 1
      ) {
        return NextResponse.json(
          { error: "Kohtade arv peab olema positiivne täisarv" },
          { status: 400 }
        )
      }
    }
    if (!isClassBalanceMode(body.registrationClassBalanceMode)) {
      return NextResponse.json(
        { error: "Vigane klasside tasakaalustamise valik" },
        { status: 400 }
      )
    }

    if (!Array.isArray(body.classes)) {
      return NextResponse.json(
        { error: "Klasside nimekiri puudub" },
        { status: 400 }
      )
    }
    const classes: { id?: string; name: string; order: number }[] = body.classes.map(
      (item: unknown, order: number): { id?: string; name: string; order: number } => {
        if (!item || typeof item !== "object") {
          throw new Error("Vigane klass")
        }
        const raw = item as { id?: unknown; name?: unknown }
        const name = typeof raw.name === "string" ? raw.name.trim() : ""
        if (!name || name.length > 100) throw new Error("Vigane klassi nimi")
        return {
          id: typeof raw.id === "string" ? raw.id : undefined,
          name,
          order,
        }
      }
    )
    const normalizedNames = classes.map(({ name }) => name.toLocaleLowerCase("et"))
    if (new Set(normalizedNames).size !== normalizedNames.length) {
      return NextResponse.json(
        { error: "Klasside nimed peavad olema erinevad" },
        { status: 400 }
      )
    }
    if (classes.length > 100) {
      return NextResponse.json(
        { error: "Ühel võistlusel saab olla kuni 100 klassi" },
        { status: 400 }
      )
    }
    const formFields = parseFormFields(body.formFields)
    const allocationRules = parseAllocationRules(body.allocationRules)

    const updated = await prisma.$transaction(async (tx) => {
      const current = await tx.competition.findUnique({
        where: { id },
        include: {
          registrationClasses: true,
          registrationFormFields: true,
        },
      })
      if (!current) throw new Error("Võistlust ei leitud")

      const currentById = new Map(
        current.registrationClasses.map((item) => [item.id, item])
      )
      const currentByName = new Map(
        current.registrationClasses.map((item) => [
          item.name.toLocaleLowerCase("et"),
          item,
        ])
      )
      const retainedIds: string[] = []

      for (const item of classes) {
        const existing =
          (item.id ? currentById.get(item.id) : undefined) ??
          currentByName.get(item.name.toLocaleLowerCase("et"))
        if (existing) {
          const saved = await tx.competitionClass.update({
            where: { id: existing.id },
            data: { name: item.name, order: item.order, isActive: true },
          })
          retainedIds.push(saved.id)
        } else {
          const saved = await tx.competitionClass.create({
            data: {
              competitionId: id,
              name: item.name,
              order: item.order,
            },
          })
          retainedIds.push(saved.id)
        }
      }

      await tx.competitionClass.updateMany({
        where: {
          competitionId: id,
          ...(retainedIds.length > 0 ? { id: { notIn: retainedIds } } : {}),
        },
        data: { isActive: false },
      })

      // Vabasta semantilised unikaalsed võtmed enne väljade ümberjärjestamist.
      await tx.competitionFormField.updateMany({
        where: { competitionId: id },
        data: { semanticKey: null },
      })
      const currentFieldsById = new Map(
        current.registrationFormFields.map((field) => [field.id, field])
      )
      const currentFieldsByKey = new Map(
        current.registrationFormFields.map((field) => [field.key, field])
      )
      const retainedFieldIds: string[] = []

      for (const field of formFields) {
        const existing =
          (field.id ? currentFieldsById.get(field.id) : undefined) ??
          currentFieldsByKey.get(field.key)
        const data = {
          key: existing?.key ?? field.key,
          label: field.label,
          helpText: field.helpText,
          type: field.type,
          semanticKey: field.semanticKey,
          options: JSON.stringify(field.options),
          memberFields: JSON.stringify(field.memberFields),
          showInRegistration: field.showInRegistration,
          requiredInRegistration: field.requiredInRegistration,
          showInMandate: field.showInMandate,
          requiredInMandate: field.requiredInMandate,
          editableInMandate: field.editableInMandate,
          conditionFieldKey: field.conditionFieldKey,
          conditionOperator: field.conditionOperator,
          conditionValue: field.conditionValue,
          order: field.order,
          isActive: true,
        }
        const saved = existing
          ? await tx.competitionFormField.update({
              where: { id: existing.id },
              data,
            })
          : await tx.competitionFormField.create({
              data: { competitionId: id, ...data },
            })
        retainedFieldIds.push(saved.id)
      }

      await tx.competitionFormField.updateMany({
        where: {
          competitionId: id,
          ...(retainedFieldIds.length > 0
            ? { id: { notIn: retainedFieldIds } }
            : {}),
        },
        data: { isActive: false, semanticKey: null },
      })

      const [activeClasses, activeFields] = await Promise.all([
        tx.competitionClass.findMany({
          where: { competitionId: id, isActive: true },
          select: { id: true },
        }),
        tx.competitionFormField.findMany({
          where: { competitionId: id, isActive: true },
          select: {
            id: true,
            key: true,
            type: true,
            options: true,
            showInRegistration: true,
          },
        }),
      ])
      const classValues = new Set(activeClasses.map(({ id }) => id))
      const fieldsById = new Map(activeFields.map((field) => [field.id, field]))
      const fieldsByKey = new Map(
        activeFields.map((field) => [field.key, field])
      )
      const resolvedRuleFieldIds = new Map<number, string | null>()

      for (const [ruleIndex, rule] of allocationRules.entries()) {
        let availableValues: Set<string>
        if (rule.source === "CLASS") {
          if (activeClasses.length === 0) {
            throw new Error(
              `Reeglit „${rule.label}” ei saa kasutada klassideta võistlusel`
            )
          }
          availableValues = classValues
          resolvedRuleFieldIds.set(ruleIndex, null)
        } else {
          const field =
            (rule.fieldId ? fieldsById.get(rule.fieldId) : null) ??
            (rule.fieldKey ? fieldsByKey.get(rule.fieldKey) : null)
          if (
            !field ||
            field.type !== "SELECT" ||
            !field.showInRegistration
          ) {
            throw new Error(
              `Reegli „${rule.label}” väli peab olema registreerimisel kuvatav rippmenüü`
            )
          }
          availableValues = new Set(parseStoredValues(field.options))
          resolvedRuleFieldIds.set(ruleIndex, field.id)
        }
        if (rule.values.some((value) => !availableValues.has(value))) {
          throw new Error(
            `Reegel „${rule.label}” sisaldab valikut, mida vormis enam ei ole`
          )
        }
      }

      await tx.registrationAllocationRule.deleteMany({
        where: { competitionId: id },
      })
      for (const [ruleIndex, rule] of allocationRules.entries()) {
        await tx.registrationAllocationRule.create({
          data: {
            competitionId: id,
            label: rule.label,
            type: rule.type,
            source: rule.source,
            fieldId:
              rule.source === "FORM_FIELD"
                ? resolvedRuleFieldIds.get(ruleIndex)
                : null,
            values: JSON.stringify(rule.values),
            quota: rule.quota,
            order: rule.order,
          },
        })
      }

      const competition = await tx.competition.update({
        where: { id },
        data: {
          isPublic: Boolean(body.isPublic),
          registrationOpensAt,
          registrationClosesAt,
          registrationOverride: body.registrationOverride,
          registrationCapacity,
          registrationClassBalanceMode: body.registrationClassBalanceMode,
          mandateOpensAt,
          mandateClosesAt,
          mandateOverride: body.mandateOverride,
        },
        include: {
          registrationClasses: {
            where: { isActive: true },
            orderBy: [{ order: "asc" }, { name: "asc" }],
            select: { id: true, name: true, order: true },
          },
          registrationFormFields: {
            where: { isActive: true },
            orderBy: [{ order: "asc" }, { createdAt: "asc" }],
            select: formFieldSelect,
          },
          registrationAllocationRules: {
            where: { isActive: true },
            orderBy: [{ order: "asc" }, { createdAt: "asc" }],
            select: allocationRuleSelect,
          },
          _count: { select: { registrationApplications: true } },
        },
      })

      const events: { phase: string; action: string }[] = []
      if (current.registrationOverride !== body.registrationOverride) {
        events.push({
          phase: "REGISTRATION",
          action: `OVERRIDE_${body.registrationOverride}`,
        })
      }
      if (current.mandateOverride !== body.mandateOverride) {
        events.push({
          phase: "MANDATE",
          action: `OVERRIDE_${body.mandateOverride}`,
        })
      }
      if (events.length > 0) {
        await tx.competitionPhaseEvent.createMany({
          data: events.map((event) => ({
            competitionId: id,
            actorId: actor.id,
            ...event,
          })),
        })
      }

      if (getCompetitionRegistrationStatus(competition) === "OPEN") {
        await recalculateRegistrationAllocation(tx, id, {
          actorId: actor.id,
          eventNote: "Jaotusreeglite muutmise järel arvutatud koht",
        })
      }

      return competition
    })

    return NextResponse.json({
      ...responseData(updated),
      registrationFormFields: updated.registrationFormFields.map(
        toFormFieldDefinition
      ),
      registrationAllocationRules:
        updated.registrationAllocationRules.flatMap((rule) => {
          const definition = toAllocationRuleDefinition(rule)
          return definition ? [definition] : []
        }),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Salvestamine ebaõnnestus"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
