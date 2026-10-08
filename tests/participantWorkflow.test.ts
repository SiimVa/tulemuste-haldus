import assert from "node:assert/strict"
import test from "node:test"
import {
  participantStatus,
  participantTeamPhase,
} from "../src/lib/participantWorkflow"

const confirmedTeam = {
  competitionStatus: "SETUP",
  registrationStatus: "APPROVED",
  mandateStatus: "DRAFT",
  mandatePhase: "NOT_OPEN" as const,
}

test("kinnitatud võistkond jääb registreerimistesse kuni mandaadi avanemiseni", () => {
  const phase = participantTeamPhase(confirmedTeam)
  assert.equal(phase, "REGISTRATION")
  assert.deepEqual(participantStatus(phase, confirmedTeam.registrationStatus), {
    label: "Registreerimine kinnitatud",
    tone: "green",
    needsAttention: false,
  })
})

test("vana töövoo võistkond saab mandaati esitada kohe registreerimise kinnitamisel", () => {
  const legacyPhase = participantTeamPhase({
    ...confirmedTeam,
    hasRegistrationApplication: false,
  })
  assert.equal(legacyPhase, "MANDATE")
  assert.equal(
    participantStatus(legacyPhase, confirmedTeam.mandateStatus).label,
    "Ootab mandaadi esitamist"
  )

  assert.equal(
    participantTeamPhase({ ...confirmedTeam, hasRegistrationApplication: true }),
    "REGISTRATION",
    "Avaldusest loodud võistkond ootab mandaadiperioodi avamist"
  )
  assert.equal(
    participantTeamPhase({
      ...confirmedTeam,
      registrationStatus: "SUBMITTED",
      hasRegistrationApplication: false,
    }),
    "REGISTRATION",
    "Ka vana töövoo võistkonna registreerimine peab olema enne kinnitatud"
  )
})

test("võistkond jääb mandaadietappi avamisest kuni võistluse alguseni", () => {
  for (const mandatePhase of ["OPEN", "CLOSED", "FINALIZED"] as const) {
    assert.equal(
      participantTeamPhase({ ...confirmedTeam, mandatePhase }),
      "MANDATE",
      `Mandaadi olek ${mandatePhase} ei tohi võistkonda töölaualt eemaldada`
    )
  }

  const phase = participantTeamPhase({
    ...confirmedTeam,
    mandateStatus: "APPROVED",
    mandatePhase: "FINALIZED",
  })
  assert.deepEqual(participantStatus(phase, "APPROVED"), {
    label: "Mandaat kinnitatud",
    tone: "green",
    needsAttention: false,
  })
})

test("mandaadi avamine ei vii kinnitamata registreerimist mandaadietappi", () => {
  for (const registrationStatus of ["DRAFT", "SUBMITTED", "CHANGES_REQUESTED"]) {
    assert.equal(
      participantTeamPhase({
        ...confirmedTeam,
        registrationStatus,
        mandatePhase: "OPEN",
      }),
      "REGISTRATION"
    )
  }
})

test("mandaadiga tegelenud võistkond ei liigu ajakava muutmisel tagasi registreerimisse", () => {
  for (const mandateStatus of ["SUBMITTED", "APPROVED", "CHANGES_REQUESTED"]) {
    assert.equal(
      participantTeamPhase({ ...confirmedTeam, mandateStatus }),
      "MANDATE"
    )
  }
})

test("võistluse algus viib võistkonna aktiivsete võistluste hulka", () => {
  const phase = participantTeamPhase({
    ...confirmedTeam,
    competitionStatus: "ACTIVE",
    mandateStatus: "APPROVED",
    mandatePhase: "FINALIZED",
  })
  assert.equal(phase, "ACTIVE")
  assert.deepEqual(participantStatus(phase, "APPROVED"), {
    label: "Võistlus toimub",
    tone: "green",
    needsAttention: false,
  })
})

test("registreerimise märked eristavad esitamise, kinnitamise ja ootenimekirja", () => {
  assert.deepEqual(participantStatus("REGISTRATION", "PENDING_REVIEW"), {
    label: "Registreeritud",
    tone: "blue",
    needsAttention: false,
  })
  assert.equal(participantStatus("REGISTRATION", "SUBMITTED").label, "Registreeritud")
  assert.deepEqual(participantStatus("REGISTRATION", "CONFIRMED"), {
    label: "Registreerimine kinnitatud",
    tone: "green",
    needsAttention: false,
  })
  assert.deepEqual(participantStatus("REGISTRATION", "WAITLISTED"), {
    label: "Ootenimekirjas",
    tone: "amber",
    needsAttention: false,
  })
})

test("märked toovad esile esitamist või täiendamist vajavad võistkonnad", () => {
  assert.deepEqual(participantStatus("REGISTRATION", "DRAFT"), {
    label: "Registreerimise mustand",
    tone: "neutral",
    needsAttention: true,
  })
  assert.deepEqual(participantStatus("MANDATE", "DRAFT"), {
    label: "Ootab mandaadi esitamist",
    tone: "blue",
    needsAttention: true,
  })
  assert.deepEqual(participantStatus("MANDATE", "SUBMITTED"), {
    label: "Mandaat esitatud",
    tone: "amber",
    needsAttention: false,
  })
  for (const phase of ["REGISTRATION", "MANDATE"] as const) {
    assert.deepEqual(participantStatus(phase, "CHANGES_REQUESTED"), {
      label: "Vajab täiendamist",
      tone: "red",
      needsAttention: true,
    })
  }
})
