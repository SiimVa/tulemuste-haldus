import assert from "node:assert/strict"
import test from "node:test"
import { organizerTeamAnswers } from "../src/lib/organizerRegistration"
import { toFormFieldDefinition } from "../src/lib/registrationForm"

const field = toFormFieldDefinition({
  id: "members", key: "members", label: "Liikmed", helpText: null, type: "MEMBER_LIST", semanticKey: null,
  options: "[]", memberFields: '["name","email","phone"]', memberMinCount: 0, memberMaxCount: 4,
  showInRegistration: true, requiredInRegistration: false, showInMandate: true, requiredInMandate: false,
  editableInMandate: true, conditionFieldKey: null, conditionOperator: null, conditionValue: null,
  purgeAfterCompetition: false, order: 0,
})

test("organizer roster uses current members while retaining contact details and excluding support", () => {
  const answers = organizerTeamAnswers([field], { members: [
    { name: "Vana nimi", email: "mari@example.com", phone: "55512345" },
    { name: "Lahkunud liige" },
  ], county: "Harju" }, [
    { name: "Uus nimi", email: "mari@example.com", role: "COMPETITOR", isCaptain: true, assignmentRole: "Navigeerija" },
    { name: "Lisatud liige", email: null, role: "COMPETITOR", isCaptain: false, assignmentRole: null },
    { name: "Tugiliige", email: null, role: "SUPPORT", isCaptain: false, assignmentRole: null },
  ])
  assert.deepEqual(answers.members, [
    { name: "Uus nimi", email: "mari@example.com", phone: "55512345", isCaptain: true, assignmentRole: "Navigeerija" },
    { name: "Lisatud liige", email: undefined, isCaptain: false, assignmentRole: undefined },
  ])
  assert.equal(answers.county, "Harju")
})

test("organizer does not lose manually created members without stored form answers", () => {
  const answers = organizerTeamAnswers([field], {}, [
    { name: "Mari", email: null, role: "COMPETITOR", isCaptain: false, assignmentRole: null },
  ])
  assert.deepEqual(answers.members, [{ name: "Mari", email: undefined, isCaptain: false, assignmentRole: undefined }])
})
