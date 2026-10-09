import assert from "node:assert/strict"
import test from "node:test"
import {
  DEFAULT_MESSAGE_GROUPS,
  NO_CLASS,
  collectMessageContacts,
  isValidMessageEmail,
  messageEmailContent,
  selectMessageRecipients,
  validateMessageInput,
  type MessageApplication,
  type MessageTeam,
} from "../src/lib/competitionMessages"
import { REPRESENTATIVE_FORM_FIELD_KEYS, type FormFieldDefinition } from "../src/lib/registrationForm"

const field = (id: string, key: string, type: FormFieldDefinition["type"]): FormFieldDefinition => ({
  id, key, label: key, helpText: null, type, semanticKey: null, options: [], memberFields: ["name", "email"], memberMinCount: 1, memberMaxCount: null,
  showInRegistration: true, requiredInRegistration: false, showInMandate: true, requiredInMandate: false, editableInMandate: true,
  conditionFieldKey: null, conditionOperator: null, conditionValue: null, purgeAfterCompetition: false, order: 0,
})
const fields = [
  field("rep-email", REPRESENTATIVE_FORM_FIELD_KEYS.email, "TEXT"),
  field("rep-name", REPRESENTATIVE_FORM_FIELD_KEYS.name, "TEXT"),
  field("members", "members", "MEMBER_LIST"),
]
const members = (list: { name: string; email?: string }[]) => ({ fieldId: "members", value: JSON.stringify(list) })

const application = (id: string, status: string, extra: Partial<MessageApplication> = {}): MessageApplication => ({
  id, teamName: `Avaldus ${id}`, status, teamId: null, className: "KT",
  submittedBy: { name: `Esitaja ${id}`, email: `esitaja-${id}@example.com` },
  pendingRepresentativeName: null, pendingRepresentativeEmail: null, fieldValues: [], ...extra,
})
const team = (id: string, extra: Partial<MessageTeam> = {}): MessageTeam => ({
  id, name: `Võistkond ${id}`, className: "NK", representative: null, pendingRepresentativeName: null, pendingRepresentativeEmail: null,
  members: [], formValues: [], ...extra,
})

const contacts = collectMessageContacts({
  fields,
  applications: [
    application("a", "CONFIRMED", { fieldValues: [
      { fieldId: "rep-email", value: JSON.stringify("Esindaja.A@Example.com ") },
      { fieldId: "rep-name", value: JSON.stringify("Esindaja A") },
      members([{ name: "Mari", email: "mari@example.com" }, { name: "Jüri" }, { name: "Vigane", email: "vigane@" }]),
    ] }),
    application("w", "WAITLISTED", { className: null, fieldValues: [members([{ name: "Ootaja", email: "ootaja@example.com" }])] }),
    application("r", "REJECTED"),
    application("d", "DRAFT"),
    // Kinnitatud nimekirjast loodud võistkond on üks registreering.
    application("f", "CONFIRMED", { teamId: "t1" }),
  ],
  teams: [
    team("t1", {
      representative: { name: "Tiimi esindaja", email: "esindaja-t1@example.com" },
      pendingRepresentativeEmail: "uus-esindaja@example.com",
      members: [{ name: "Mari", email: "MARI@example.com" }, { name: "Kati", email: "kati@example.com" }, { name: "Ilma", email: null }],
    }),
  ],
})

test("kontaktid: avaldused, võistkonnad, esindajad ja liikmed", () => {
  assert.deepEqual(contacts.map((contact) => [contact.teamKey, contact.role, contact.email, contact.group]), [
    ["application:a", "REPRESENTATIVE", "esitaja-a@example.com", "CONFIRMED"],
    ["application:a", "MEMBER", "mari@example.com", "CONFIRMED"],
    ["application:a", "MEMBER", "vigane@", "CONFIRMED"],
    ["application:w", "REPRESENTATIVE", "esitaja-w@example.com", "WAITLISTED"],
    ["application:w", "MEMBER", "ootaja@example.com", "WAITLISTED"],
    ["team:t1", "REPRESENTATIVE", "esindaja-t1@example.com", "TEAM"],
    ["team:t1", "MEMBER", "mari@example.com", "TEAM"],
    ["team:t1", "MEMBER", "kati@example.com", "TEAM"],
  ])
})

test("saajad: vaikimisi grupid, ühele aadressile üks kiri, vigased välja", () => {
  const { recipients, invalid } = selectMessageRecipients(contacts, { groups: DEFAULT_MESSAGE_GROUPS, roles: ["REPRESENTATIVE", "MEMBER"], classes: null })
  assert.deepEqual(invalid, ["vigane@"])
  assert.deepEqual(recipients.map((recipient) => [recipient.email, recipient.contexts]), [
    ["esitaja-a@example.com", ["Avaldus a (esindaja)"]],
    // Mari on liige kahes registreeringus: üks kiri, mõlemad põhjused.
    ["mari@example.com", ["Avaldus a (liige)", "Võistkond t1 (liige)"]],
    ["esindaja-t1@example.com", ["Võistkond t1 (esindaja)"]],
    ["kati@example.com", ["Võistkond t1 (liige)"]],
  ])
})

test("saajad: rolli, oleku ja klassi filter", () => {
  const representatives = selectMessageRecipients(contacts, { groups: ["TEAM"], roles: ["REPRESENTATIVE"], classes: null })
  assert.deepEqual(representatives.recipients.map((recipient) => recipient.email), ["esindaja-t1@example.com"])
  const waitlist = selectMessageRecipients(contacts, { groups: ["WAITLISTED"], roles: ["REPRESENTATIVE", "MEMBER"], classes: [NO_CLASS] })
  assert.deepEqual(waitlist.recipients.map((recipient) => recipient.email), ["esitaja-w@example.com", "ootaja@example.com"])
  const kt = selectMessageRecipients(contacts, { groups: ["TEAM", "CONFIRMED", "WAITLISTED"], roles: ["MEMBER"], classes: ["KT"] })
  assert.deepEqual(kt.recipients.map((recipient) => recipient.email), ["mari@example.com"])
  assert.deepEqual(selectMessageRecipients(contacts, { groups: [], roles: ["MEMBER"], classes: null }).recipients, [])
})

test("aadressi ja sisendi kontroll", () => {
  assert.equal(isValidMessageEmail("mari@example.com"), true)
  assert.equal(isValidMessageEmail("vigane@"), false)
  assert.equal(isValidMessageEmail("a b@example.com"), false)
  assert.equal(validateMessageInput("", "sisu"), "Kirja teema on kohustuslik")
  assert.equal(validateMessageInput("Teema\nBcc: x@y.ee", "sisu"), "Teema peab olema ühel real")
  assert.equal(validateMessageInput("Teema", "  "), "Kirja sisu on kohustuslik")
  assert.equal(validateMessageInput("Teema", "x".repeat(20_001)), "Kiri võib olla kuni 20000 märki")
  assert.equal(validateMessageInput("Teema", "Sisu"), null)
})

test("kirja sisu: lõigud, lingid, varjestus ja jalus", () => {
  const content = messageEmailContent({
    competitionName: "Jäljed metsas",
    subject: " Info <stardiks> ",
    body: "Tere!\nStart on kell 10.\n\nVaata https://www.matkamang.ee/info. <script>alert(1)</script>",
    contexts: ["Osula NK (esindaja)"],
  })
  assert.equal(content.subject, "Info <stardiks>")
  assert.match(content.text, /^Tere!\nStart on kell 10\.\n\nVaata https:\/\/www\.matkamang\.ee\/info\./)
  assert.match(content.text, /registreerunud: Osula NK \(esindaja\)\. Vastamiseks vasta sellele kirjale\.$/)
  assert.match(content.html, /<h1[^>]*>Info &lt;stardiks&gt;<\/h1>/)
  assert.match(content.html, /<p[^>]*>Tere!<br>Start on kell 10\.<\/p><p[^>]*>Vaata <a href="https:\/\/www\.matkamang\.ee\/info"/)
  assert.ok(!content.html.includes("<script>"))
  assert.ok(content.html.includes("&lt;script&gt;"))
})


test("esindaja vahetusel ei lisata algset registreerijat ega vana vormikontakti saajateks", () => {
  const contacts = collectMessageContacts({ fields, teams: [], applications: [
    application("a", "CONFIRMED", { representative: { name: "Uus", email: "uus@example.com" }, fieldValues: [{ fieldId: "rep-email", value: '"vana@example.com"' }] }),
    application("b", "WAITLISTED", { pendingRepresentativeEmail: "kontota@example.com", pendingRepresentativeName: "Kontota" }),
  ] })
  assert.deepEqual(contacts.map(contact => contact.email), ["uus@example.com", "kontota@example.com"])
})
