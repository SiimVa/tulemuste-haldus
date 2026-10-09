import assert from "node:assert/strict"
import test from "node:test"
import { applicationRepresentativeIdentity, applicationRepresentativeId, currentRepresentativeAnswers, teamRepresentativeIdentity } from "../src/lib/representativeIdentity"
import { REPRESENTATIVE_FORM_FIELD_KEYS as keys } from "../src/lib/registrationForm"
const original = { id: "a", name: "Registreerija", email: "a@example.com" }
const current = { id: "b", name: "Esindaja", email: "b@example.com" }

test("algne registreerija ei määra esindajat pärast konto või kontota esindaja määramist", () => {
  assert.equal(applicationRepresentativeId({ submittedById: "a", representativeId: "b" }), "b")
  assert.equal(applicationRepresentativeId({ submittedById: "a", representativeId: "b", pendingRepresentativeEmail: "c@example.com" }), null)
  assert.deepEqual(applicationRepresentativeIdentity({ submittedBy: original, representative: current }), current)
  assert.deepEqual(applicationRepresentativeIdentity({ submittedBy: original, representative: current, pendingRepresentativeEmail: "c@example.com", pendingRepresentativeName: "Ootel" }), { name: "Ootel", email: "c@example.com" })
})

test("eemaldatud võistkonna esindajat ei taastata vanadest vormivastustest", () => {
  const answers = { [keys.name]: original.name, [keys.email]: original.email, [keys.phone]: "50000000", county: "Harju" }
  assert.equal(teamRepresentativeIdentity({ representative: null }), null)
  assert.equal(applicationRepresentativeId({ submittedById: "a", teamId: "team", representativeId: null }), null)
  assert.deepEqual(currentRepresentativeAnswers(answers, null), { [keys.name]: "", [keys.email]: "", [keys.phone]: "", county: "Harju" })
  assert.equal(answers[keys.phone], "50000000")
})

test("telefon säilib sama konto sidumisel, kuid ei kandu teisele esindajale", () => {
  const answers = { [keys.name]: "Vana kontonimi", [keys.email]: " B@Example.com ", [keys.phone]: "51111111" }
  assert.deepEqual(currentRepresentativeAnswers(answers, current), { [keys.name]: current.name, [keys.email]: current.email, [keys.phone]: "51111111" })
  assert.equal(currentRepresentativeAnswers(answers, original)[keys.phone], "")
})
