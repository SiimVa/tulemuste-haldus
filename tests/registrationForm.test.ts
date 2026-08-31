import assert from "node:assert/strict"
import test from "node:test"
import {
  type FormFieldDefinition,
  isFormFieldVisible,
  representativeFormFields,
  validateFormAnswers,
  withRepresentativeIdentity,
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
    memberMinCount: 1,
    memberMaxCount: null,
    showInRegistration: true,
    requiredInRegistration: true,
    showInMandate: true,
    requiredInMandate: true,
    editableInMandate: false,
    conditionFieldKey: null,
    conditionOperator: null,
    conditionValue: null,
    purgeAfterCompetition: false,
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

test("liikmete loend kontrollib korraldaja määratud liikmete arvu", () => {
  const members = field({
    key: "members",
    label: "Võistkonna liikmed",
    type: "MEMBER_LIST",
    semanticKey: null,
    options: [],
    memberFields: ["name"],
    memberMinCount: 3,
    memberMaxCount: 4,
    requiredInRegistration: true,
  })

  assert.equal(
    validateFormAnswers(
      [members],
      { members: [{ name: "Üks" }, { name: "Kaks" }] },
      "REGISTRATION"
    ).errors.members,
    "Lisa vähemalt 3 liiget"
  )
  assert.equal(
    validateFormAnswers(
      [members],
      {
        members: [
          { name: "Üks" },
          { name: "Kaks" },
          { name: "Kolm" },
          { name: "Neli" },
          { name: "Viis" },
        ],
      },
      "REGISTRATION"
    ).errors.members,
    "Võistkonnas võib olla kuni 4 liiget"
  )
  assert.deepEqual(
    validateFormAnswers(
      [members],
      {
        members: [
          { name: "Üks" },
          { name: "Kaks" },
          { name: "Kolm" },
        ],
      },
      "REGISTRATION"
    ).errors,
    {}
  )
})

test("vabatahtlik liikmete loend võib olla tühi või alla mandaadi miinimumi", () => {
  const members = field({
    key: "members",
    label: "Võistkonna liikmed",
    type: "MEMBER_LIST",
    semanticKey: null,
    options: [],
    memberFields: ["name"],
    memberMinCount: 2,
    requiredInRegistration: false,
  })

  assert.deepEqual(
    validateFormAnswers([members], { members: [] }, "REGISTRATION").errors,
    {}
  )
  assert.deepEqual(
    validateFormAnswers(
      [members],
      { members: [{ name: "Ainuke" }] },
      "REGISTRATION"
    ).errors,
    {}
  )

  assert.equal(
    validateFormAnswers(
      [members],
      { members: [{ name: "Ainuke" }] },
      "MANDATE"
    ).errors.members,
    "Lisa vähemalt 2 liiget"
  )
})

test("kohustusliku esindaja süsteemiväljad on registreerimisel nõutud", () => {
  const fields = representativeFormFields()
  const invalid = validateFormAnswers(fields, {}, "REGISTRATION")
  assert.deepEqual(Object.keys(invalid.errors), [
    "system_representative_name",
    "system_representative_email",
    "system_representative_phone",
  ])

  const valid = validateFormAnswers(
    fields,
    {
      system_representative_name: "Mari Mets",
      system_representative_email: "mari@example.com",
      system_representative_phone: "+372 5555 5555",
    },
    "REGISTRATION"
  )
  assert.deepEqual(valid.errors, {})
})

test("esindaja nimi ja e-post võetakse usaldusväärselt kasutajakontolt", () => {
  assert.deepEqual(
    withRepresentativeIdentity(
      {
        system_representative_name: "Vale nimi",
        system_representative_email: "vale@example.com",
        system_representative_phone: "+372 5555 5555",
      },
      { name: "Mari Mets", email: "mari@example.com" }
    ),
    {
      system_representative_name: "Mari Mets",
      system_representative_email: "mari@example.com",
      system_representative_phone: "+372 5555 5555",
    }
  )
})
