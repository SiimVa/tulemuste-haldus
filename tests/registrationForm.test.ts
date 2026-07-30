import assert from "node:assert/strict"
import test from "node:test"
import {
  type FormFieldDefinition,
  isFormFieldVisible,
  validateFormAnswers,
} from "../src/lib/registrationForm"

function field(
  patch: Partial<FormFieldDefinition> = {}
): FormFieldDefinition {
  return {
    key: "county",
    label: "Maakond",
    helpText: null,
    type: "SELECT",
    semanticKey: "COUNTY",
    options: ["Harjumaa", "Raplamaa"],
    memberFields: ["name"],
    showInRegistration: true,
    requiredInRegistration: true,
    showInMandate: true,
    requiredInMandate: true,
    editableInMandate: false,
    conditionFieldKey: null,
    conditionOperator: null,
    conditionValue: null,
    order: 0,
    ...patch,
  }
}

test("kohustuslik valik peab tulema korraldaja nimekirjast", () => {
  const missing = validateFormAnswers([field()], {}, "REGISTRATION")
  assert.equal(missing.errors.county, "Väli on kohustuslik")

  const invalid = validateFormAnswers(
    [field()],
    { county: "Suvaline maakond" },
    "REGISTRATION"
  )
  assert.equal(invalid.errors.county, "Vali väärtus etteantud nimekirjast")

  const valid = validateFormAnswers(
    [field()],
    { county: "Raplamaa" },
    "REGISTRATION"
  )
  assert.deepEqual(valid, {
    answers: { county: "Raplamaa" },
    errors: {},
  })
})

test("tingimuslik väli kuvatakse ainult oodatud vastuse korral", () => {
  const conditional = field({
    key: "detail",
    label: "Täpsustus",
    type: "TEXT",
    semanticKey: null,
    options: [],
    requiredInRegistration: true,
    conditionFieldKey: "county",
    conditionOperator: "EQUALS",
    conditionValue: "Raplamaa",
    order: 1,
  })

  assert.equal(
    isFormFieldVisible(conditional, { county: "Harjumaa" }),
    false
  )
  assert.equal(
    isFormFieldVisible(conditional, { county: "Raplamaa" }),
    true
  )

  const hidden = validateFormAnswers(
    [field(), conditional],
    { county: "Harjumaa" },
    "REGISTRATION"
  )
  assert.deepEqual(hidden.errors, {})
  assert.equal("detail" in hidden.answers, false)

  const shown = validateFormAnswers(
    [field(), conditional],
    { county: "Raplamaa" },
    "REGISTRATION"
  )
  assert.equal(shown.errors.detail, "Väli on kohustuslik")
})

test("registreerimisel vabatahtlik väli võib olla mandaadis kohustuslik", () => {
  const phone = field({
    key: "phone",
    label: "Kontakttelefon",
    type: "PHONE",
    semanticKey: null,
    options: [],
    requiredInRegistration: false,
    requiredInMandate: true,
  })

  assert.deepEqual(
    validateFormAnswers([phone], {}, "REGISTRATION").errors,
    {}
  )
  assert.equal(
    validateFormAnswers([phone], {}, "MANDATE").errors.phone,
    "Väli on kohustuslik"
  )
})

test("liikmete loend nõuab iga täidetud rea puhul nime", () => {
  const members = field({
    key: "members",
    label: "Võistkonna liikmed",
    type: "MEMBER_LIST",
    semanticKey: null,
    options: [],
    memberFields: ["name", "email", "phone", "birthDate"],
    requiredInRegistration: false,
    requiredInMandate: true,
  })

  const invalid = validateFormAnswers(
    [members],
    { members: [{ email: "liige@example.com" }] },
    "MANDATE"
  )
  assert.equal(invalid.errors.members, "Igal liikmel peab olema nimi")

  const valid = validateFormAnswers(
    [members],
    {
      members: [
        {
          name: "Mari Mets",
          email: "mari@example.com",
          birthDate: "2010-05-02",
        },
      ],
    },
    "MANDATE"
  )
  assert.deepEqual(valid.errors, {})
  assert.deepEqual(valid.answers.members, [
    {
      name: "Mari Mets",
      email: "mari@example.com",
      birthDate: "2010-05-02",
    },
  ])
})
