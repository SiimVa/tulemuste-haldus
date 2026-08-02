import { expect, test, type Page } from "@playwright/test"

const admin = {
  email: "admin.e2e@example.com",
  name: "E2E Admin",
  password: "turvaline-parool-123",
}

const otherOrganizer = {
  email: "teine.e2e@example.com",
  name: "Teine korraldaja",
  password: "teine-turvaline-123",
}

const representative = {
  email: "esindaja.e2e@example.com",
  name: "E2E Esindaja",
  password: "esindaja-turvaline-123",
}

const setupSecret = "e2e-setup-secret-used-only-by-playwright-tests"

async function login(page: Page, email: string, password: string) {
  await page.goto("/login")
  await page.getByPlaceholder("admin@example.com").fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole("button", { name: "Logi sisse" }).click()
  await page.waitForURL("**/dashboard")
}

test.describe.serial("võistluse põhivoog", () => {
  let competitionId = ""
  let teamId = ""
  let secondTeamId = ""
  let elementId = ""
  let judgeToken = ""
  let athleteToken = ""

  test.beforeAll(async ({ request }) => {
    const response = await request.post("/api/setup", {
      headers: { "x-setup-secret": setupSecret },
      data: admin,
    })

    expect(response.status(), await response.text()).toBe(200)
  })

  test("korraldaja loob võistluse, võistkonna ja hindamise ligipääsud", async ({ page }) => {
    await login(page, admin.email, admin.password)

    await page.goto("/dashboard/competitions/new")
    await page.getByPlaceholder("nt. Roheline matk 2026").fill("E2E proovivõistlus")
    await page.getByPlaceholder("nt. Kõrvemaa matkarajad").fill("Kõrvemaa")
    const createCompetitionResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/competitions") &&
        response.request().method() === "POST"
    )
    await page.getByRole("button", { name: "Loo võistlus" }).click()
    const createdCompetition = await (await createCompetitionResponse).json()
    competitionId = createdCompetition.id ?? ""
    expect(competitionId).not.toBe("")
    await page.waitForURL(`/dashboard/competitions/${competitionId}`)

    await page.goto(`/dashboard/competitions/${competitionId}/teams`)
    await page.getByRole("button", { name: "+ Lisa võistkond" }).click()
    await page.getByPlaceholder("Uulukad").fill("Testvõistkond")
    await page.getByPlaceholder("VK 1").fill("VK 1")
    await page.getByPlaceholder("P/S").fill("P")
    await page.getByRole("button", { name: "Lisa", exact: true }).click()
    await expect(page.getByText("Testvõistkond", { exact: true })).toBeVisible()

    const competitionResponse = await page.request.get(`/api/competitions/${competitionId}`)
    expect(competitionResponse.status()).toBe(200)
    const competition = await competitionResponse.json()
    teamId = competition.teams.find((team: { name: string }) => team.name === "Testvõistkond")?.id ?? ""
    expect(teamId).not.toBe("")

    await page.getByRole("button", { name: "Muuda" }).click()
    await page.getByRole("button", { name: "+ Lisa liige" }).click()
    await page.getByPlaceholder("Liikme nimi").fill("Hiljem lisatud liige")
    await page.getByRole("button", { name: "Salvesta", exact: true }).click()
    await expect(page.getByText("1 liiget", { exact: true })).toBeVisible()

    const updatedCompetitionResponse = await page.request.get(
      `/api/competitions/${competitionId}`
    )
    const updatedCompetition = await updatedCompetitionResponse.json()
    expect(
      updatedCompetition.teams.find(
        (team: { id: string }) => team.id === teamId
      )?.members
    ).toEqual([
      expect.objectContaining({ name: "Hiljem lisatud liige" }),
    ])

    const elementResponse = await page.request.post(
      `/api/competitions/${competitionId}/elements`,
      {
        data: {
          name: "Kontrollpunkt 1",
          code: "KP1",
          type: "CHECKPOINT",
          maxValue: 30,
          config: {},
          fields: [
            {
              name: "aeg",
              label: "Aeg",
              type: "TIME",
              isResultField: true,
              rankingPriority: 1,
              order: 0,
              validation: { required: true },
            },
          ],
          exceptions: [{ label: "Ei läbinud", penalty: 40, order: 0 }],
          calcMethod: {
            type: "ABSOLUTE_TIME",
            params: { higherIsBetter: false },
          },
        },
      }
    )
    expect(elementResponse.status(), await elementResponse.text()).toBe(200)
    elementId = (await elementResponse.json()).id

    const visibilityResponse = await page.request.patch(
      `/api/competitions/${competitionId}/athlete-visibility`,
      {
        data: {
          mode: "EXACT",
          showTotal: true,
          showRank: true,
          revealAll: true,
        },
      }
    )
    expect(visibilityResponse.status()).toBe(200)

    const judgeResponse = await page.request.post("/api/tokens", {
      data: {
        type: "JUDGE",
        name: "E2E kohtunik",
        competitionId,
        elementId,
      },
    })
    expect(judgeResponse.status(), await judgeResponse.text()).toBe(200)
    judgeToken = (await judgeResponse.json()).token

    const athleteResponse = await page.request.post("/api/tokens", {
      data: {
        type: "ATHLETE",
        name: "E2E võistleja",
        competitionId,
        teamId,
      },
    })
    expect(athleteResponse.status(), await athleteResponse.text()).toBe(200)
    athleteToken = (await athleteResponse.json()).token

    const representativeResponse = await page.request.post("/api/users", {
      data: representative,
    })
    expect(
      representativeResponse.status(),
      await representativeResponse.text()
    ).toBe(200)

  })

  test("kohtunik sisestab tulemuse ja pingerida arvutatakse", async ({ page }) => {
    await page.goto(`/judge/${judgeToken}`)
    await expect(page.getByText("E2E proovivõistlus", { exact: true })).toBeVisible()

    await page.getByRole("button", { name: /VK 1.*Testvõistkond/ }).click()
    const timeInput = page.locator('form input[inputmode="numeric"]')
    await timeInput.fill("123")
    await expect(timeInput).toHaveValue("1:23")
    await page.getByRole("button", { name: "✓ Salvesta tulemus" }).click()
    await expect(page.getByText(/Viimati salvestatud: Testvõistkond/)).toBeVisible()

    const leaderboardResponse = await page.request.get(
      `/api/competitions/${competitionId}/leaderboard`
    )
    expect(leaderboardResponse.status()).toBe(200)
    const leaderboard = await leaderboardResponse.json()
    const teamResult = leaderboard.leaderboard.find(
      (entry: { team: { id: string } }) => entry.team.id === teamId
    )
    expect(teamResult.total).toBe(83)
    expect(teamResult.rank).toBe(1)
  })

  test("võistleja näeb sisestatud tulemust ja avaldatud punkte", async ({ page }) => {
    await page.goto(`/athlete/${athleteToken}`)

    await expect(page.getByRole("heading", { name: "Testvõistkond" })).toBeVisible()
    await expect(page.getByText("Kontrollpunkt 1", { exact: true })).toBeVisible()
    await expect(page.getByText("1:23", { exact: true })).toBeVisible()
    await expect(page.getByText("83p", { exact: true }).first()).toBeVisible()
  })

  test("esindaja täidab registreerimise ja mandaadi", async ({ browser }) => {
    const adminContext = await browser.newContext()
    const adminPage = await adminContext.newPage()
    await login(adminPage, admin.email, admin.password)

    const secondTeamResponse = await adminPage.request.post(
      `/api/competitions/${competitionId}/teams`,
      {
        data: {
          name: "Teine testvõistkond",
          code: "VK 2",
          class: "P",
          members: [{ name: "Käsitsi lisatud liige" }],
        },
      }
    )
    expect(secondTeamResponse.status(), await secondTeamResponse.text()).toBe(200)
    secondTeamId = (await secondTeamResponse.json()).id
    expect(secondTeamId).not.toBe("")

    const assignmentResponse = await adminPage.request.post(
      `/api/competitions/${competitionId}/representatives`,
      {
        data: {
          email: representative.email,
          teamIds: [teamId, secondTeamId],
        },
      }
    )
    expect(assignmentResponse.status(), await assignmentResponse.text()).toBe(200)
    expect(await assignmentResponse.json()).toHaveLength(2)

    const context = await browser.newContext()
    const page = await context.newPage()

    await login(page, representative.email, representative.password)
    await expect(
      page.getByRole("heading", { name: "Minu esindatavad võistkonnad" })
    ).toBeVisible()
    await expect(
      page.getByRole("heading", { name: /VK 1 · Testvõistkond/ })
    ).toBeVisible()

    const assignmentsResponse = await page.request.get(
      "/api/representative/teams"
    )
    expect(
      assignmentsResponse.status(),
      await assignmentsResponse.text()
    ).toBe(200)

    const assignments = await assignmentsResponse.json()
    expect(assignments).toHaveLength(2)
    expect(
      assignments.map(
        (assignment: { team: { id: string } }) => assignment.team.id
      )
    ).toEqual(expect.arrayContaining([teamId, secondTeamId]))

    await page
      .getByRole("heading", { name: /VK 1 · Testvõistkond/ })
      .click()
    await page.waitForURL(`/dashboard/representative/teams/${teamId}`)
    await page.getByLabel("Klass").fill("Põhiklass")
    await page.getByRole("button", { name: "Esita registreerimine" }).click()
    await expect(
      page.getByText("Registreerimine esitatud korraldajale")
    ).toBeVisible()

    await adminPage.goto(
      `/dashboard/competitions/${competitionId}/registrations`
    )
    await expect(
      adminPage.getByRole("heading", {
        name: "Registreerimine ja mandaat",
      })
    ).toBeVisible()
    await adminPage.getByRole("button", { name: "Kinnita" }).click()
    await expect(
      adminPage.getByText("Kinnitatud", { exact: true }).first()
    ).toBeVisible()

    await page.reload()
    await page.getByRole("button", { name: "+ Lisa liige" }).click()
    await page.getByRole("button", { name: "+ Lisa liige" }).click()
    const memberInputs = page.getByPlaceholder("Ees- ja perekonnanimi")
    await memberInputs.nth(0).fill("Mari Mets")
    await memberInputs.nth(1).fill("Jüri Järv")
    await page.locator("select").nth(1).selectOption("SUPPORT")
    await page.getByRole("button", { name: "Esita mandaat" }).click()
    await expect(
      page.getByText("Mandaat esitatud korraldajale")
    ).toBeVisible()

    await adminPage.reload()
    await adminPage.getByRole("button", { name: "Kinnita" }).click()
    await expect(
      adminPage.getByText("Kinnitatud", { exact: true }).nth(1)
    ).toBeVisible()

    const workflowResponse = await page.request.get(
      `/api/representative/teams/${teamId}`
    )
    expect(workflowResponse.status(), await workflowResponse.text()).toBe(200)
    const workflow = await workflowResponse.json()
    expect(workflow.registrationStatus).toBe("APPROVED")
    expect(workflow.mandateStatus).toBe("APPROVED")
    expect(workflow.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Mari Mets", role: "COMPETITOR" }),
        expect.objectContaining({ name: "Jüri Järv", role: "SUPPORT" }),
      ])
    )

    const managementResponse = await page.request.get(
      `/api/competitions/${competitionId}`
    )
    expect(managementResponse.status()).toBe(403)

    const broadTeamUpdate = await page.request.patch(
      `/api/competitions/${competitionId}/teams/${teamId}`,
      { data: { name: "Lubamatu muudatus" } }
    )
    expect(broadTeamUpdate.status()).toBe(403)

    await context.close()
    await adminContext.close()
  })

  test("avalik registreerimine kinnitab koha või lisab ootenimekirja", async ({
    browser,
  }) => {
    const adminContext = await browser.newContext()
    const adminPage = await adminContext.newPage()
    await login(adminPage, admin.email, admin.password)

    const formFields = [
      {
        key: "county",
        label: "Maakond",
        helpText: "Vali võistkonna maakond",
        type: "SELECT",
        semanticKey: "COUNTY",
        options: ["Harjumaa", "Raplamaa", "Tartumaa"],
        memberFields: ["name"],
        showInRegistration: true,
        requiredInRegistration: true,
        showInMandate: true,
        requiredInMandate: true,
        editableInMandate: false,
        conditionFieldKey: null,
        conditionOperator: null,
        conditionValue: null,
      },
      {
        key: "team_type",
        label: "Võistkonna liik",
        helpText: null,
        type: "SELECT",
        semanticKey: "TEAM_TYPE",
        options: ["Noored Kotkad", "Kodutütred", "Lapsevanemad"],
        memberFields: ["name"],
        showInRegistration: true,
        requiredInRegistration: true,
        showInMandate: true,
        requiredInMandate: true,
        editableInMandate: false,
        conditionFieldKey: null,
        conditionOperator: null,
        conditionValue: null,
      },
      {
        key: "unit_name",
        label: "Rühma nimi",
        helpText: "Noorteorganisatsiooni rühm",
        type: "TEXT",
        semanticKey: null,
        options: [],
        memberFields: ["name"],
        showInRegistration: true,
        requiredInRegistration: true,
        showInMandate: true,
        requiredInMandate: true,
        editableInMandate: true,
        conditionFieldKey: "team_type",
        conditionOperator: "EQUALS",
        conditionValue: "Noored Kotkad",
      },
      {
        key: "contact_email",
        label: "Kontaktisiku e-post",
        helpText: null,
        type: "EMAIL",
        semanticKey: null,
        options: [],
        memberFields: ["name"],
        showInRegistration: true,
        requiredInRegistration: false,
        showInMandate: true,
        requiredInMandate: true,
        editableInMandate: true,
        conditionFieldKey: null,
        conditionOperator: null,
        conditionValue: null,
      },
      {
        key: "members",
        label: "Võistkonna liikmed",
        helpText: null,
        type: "MEMBER_LIST",
        semanticKey: null,
        options: [],
        memberFields: ["name", "email", "phone", "birthDate"],
        showInRegistration: true,
        requiredInRegistration: false,
        showInMandate: true,
        requiredInMandate: true,
        editableInMandate: true,
        conditionFieldKey: null,
        conditionOperator: null,
        conditionValue: null,
      },
    ]
    const settingsResponse = await adminPage.request.patch(
      `/api/competitions/${competitionId}/registration-settings`,
      {
        data: {
          isPublic: true,
          registrationOpensAt: null,
          registrationClosesAt: null,
          registrationOverride: "OPEN",
          registrationCapacity: 2,
          registrationClassBalanceMode: "OFF",
          mandateOpensAt: null,
          mandateClosesAt: null,
          mandateOverride: "AUTO",
          classes: [],
          formFields,
          allocationRules: [
            {
              label: "Iga maakonna üks kiireim",
              type: "GROUP_GUARANTEE",
              source: "FORM_FIELD",
              fieldId: null,
              fieldKey: "county",
              values: [],
              quota: 1,
              order: 0,
            },
            {
              label: "Noorteorganisatsioonide võistkonnad",
              type: "PRIORITY",
              source: "FORM_FIELD",
              fieldId: null,
              fieldKey: "team_type",
              values: ["Noored Kotkad", "Kodutütred"],
              quota: null,
              order: 1,
            },
          ],
        },
      }
    )
    expect(settingsResponse.status(), await settingsResponse.text()).toBe(200)
    const settings = await settingsResponse.json()
    expect(settings.registrationStatus).toBe("OPEN")
    await adminPage.goto(
      `/dashboard/competitions/${competitionId}/registration-settings`
    )
    await expect(
      adminPage.getByRole("heading", { name: "Registreerimisvorm" })
    ).toBeVisible()
    await expect(
      adminPage.locator('input[value="Maakond"]')
    ).toBeVisible()
    await expect(
      adminPage.getByRole("heading", {
        name: "Kohtade automaatne jaotamine",
      })
    ).toBeVisible()
    await expect(
      adminPage.locator('input[value="Iga maakonna üks kiireim"]')
    ).toBeVisible()

    const representativeContext = await browser.newContext()
    const page = await representativeContext.newPage()
    await login(page, representative.email, representative.password)
    await page.goto(`/competitions/${competitionId}`)

    await page.getByLabel("Võistkonna nimi").fill("Avalik testvõistkond 1")
    await expect(page.getByLabel("Klass")).toHaveCount(0)
    await page.getByLabel("Maakond").selectOption("Harjumaa")
    await page.getByLabel("Võistkonna liik").selectOption("Noored Kotkad")
    await page.getByLabel("Rühma nimi").fill("Harju rühm")
    await page.getByRole("button", { name: "+ Lisa liige" }).click()
    await page.getByLabel("Liige 1 nimi").fill("Registreerimisel lisatud liige")
    await page
      .getByLabel("Liige 1 e-post")
      .fill("registreerimise.liige@example.com")
    await page.getByRole("button", { name: "Registreeri võistkond" }).click()
    await expect(page.getByText("Võistkond on registreeritud.")).toBeVisible()
    await expect(page.getByText("Registreeritud", { exact: true })).toBeVisible()

    await page.getByLabel("Võistkonna nimi").fill("Avalik testvõistkond 2")
    await page.getByLabel("Maakond").selectOption("Harjumaa")
    await page.getByLabel("Võistkonna liik").selectOption("Noored Kotkad")
    await page.getByLabel("Rühma nimi").fill("Harju teine rühm")
    await page.getByRole("button", { name: "Registreeri võistkond" }).click()
    await expect(page.getByText("Võistkond on registreeritud.")).toBeVisible()

    await page.getByLabel("Võistkonna nimi").fill("Avalik testvõistkond 3")
    await page.getByLabel("Maakond").selectOption("Raplamaa")
    await page.getByLabel("Võistkonna liik").selectOption("Kodutütred")
    await page.getByRole("button", { name: "Registreeri võistkond" }).click()
    await expect(page.getByText("Võistkond on registreeritud.")).toBeVisible()
    const secondApplication = page
      .getByText("Avalik testvõistkond 2", { exact: true })
      .locator("..")
      .locator("..")
    await expect(
      secondApplication.getByText("Ootenimekirjas", { exact: true })
    ).toBeVisible()
    await expect(
      secondApplication.getByText("Ootenimekirja koht: 1.", { exact: true })
    ).toBeVisible()
    await expect(
      page.getByText("Garanteeritud koht: Iga maakonna üks kiireim")
    ).toHaveCount(2)

    await secondApplication.getByRole("button", { name: "Muuda" }).click()
    await expect(
      page.getByRole("heading", { name: "Muuda registreeringut" })
    ).toBeVisible()
    await expect(page.getByLabel("Võistkonna nimi")).toHaveValue(
      "Avalik testvõistkond 2"
    )
    await expect(page.getByLabel("Rühma nimi")).toHaveValue(
      "Harju teine rühm"
    )
    await page.getByLabel("Maakond").selectOption("Tartumaa")
    await page.getByRole("button", { name: "Salvesta muudatused" }).click()
    await expect(
      page.getByText(
        "Muudatused salvestatud. Uus staatus: Registreeritud."
      )
    ).toBeVisible()
    await expect(
      secondApplication.getByText("Registreeritud", { exact: true })
    ).toBeVisible()
    await expect(
      secondApplication.getByText(/Ootenimekirja koht:/)
    ).toHaveCount(0)
    const thirdApplication = page
      .getByText("Avalik testvõistkond 3", { exact: true })
      .locator("..")
      .locator("..")
    await expect(
      thirdApplication.getByText("Ootenimekirjas", { exact: true })
    ).toBeVisible()
    await expect(
      thirdApplication.getByText("Ootenimekirja koht: 1.", { exact: true })
    ).toBeVisible()

    await adminPage.goto(
      `/dashboard/competitions/${competitionId}/registrations`
    )
    const organizerSecondApplication = adminPage
      .locator("article")
      .filter({ hasText: "Avalik testvõistkond 2" })
    await organizerSecondApplication
      .getByText(/Muudatuste ajalugu/)
      .click()
    await expect(
      organizerSecondApplication.getByText("Muudetud väljad: Maakond")
    ).toBeVisible()

    const applicationsResponse = await adminPage.request.get(
      `/api/competitions/${competitionId}/registrations`
    )
    const applicationsPayload = await applicationsResponse.json()
    const secondApplicationId = applicationsPayload.applications.find(
      (item: { teamName: string }) =>
        item.teamName === "Avalik testvõistkond 2"
    )?.id
    expect(secondApplicationId).toBeTruthy()
    const unauthorizedEdit = await adminPage.request.patch(
      `/api/registration-applications/${secondApplicationId}`,
      {
        data: {
          teamName: "Lubamatu muudatus",
          classId: null,
          answers: {},
        },
      }
    )
    expect(unauthorizedEdit.status()).toBe(409)

    page.once("dialog", (dialog) => dialog.accept())
    await page
      .getByText("Avalik testvõistkond 1", { exact: true })
      .locator("..")
      .locator("..")
      .getByRole("button", { name: "Loobu" })
      .click()
    await expect(
      secondApplication.getByText("Registreeritud", { exact: true })
    ).toBeVisible()
    await expect(
      thirdApplication.getByText("Registreeritud", { exact: true })
    ).toBeVisible()
    await expect(
      thirdApplication.getByText(/Ootenimekirja koht:/)
    ).toHaveCount(0)

    const closedResponse = await adminPage.request.patch(
      `/api/competitions/${competitionId}/registration-settings`,
      {
        data: {
          isPublic: true,
          registrationOpensAt: null,
          registrationClosesAt: null,
          registrationOverride: "CLOSED",
          registrationCapacity: 2,
          registrationClassBalanceMode:
            settings.registrationClassBalanceMode,
          mandateOpensAt: null,
          mandateClosesAt: null,
          mandateOverride: "AUTO",
          classes: settings.registrationClasses,
          formFields: settings.registrationFormFields,
          allocationRules: settings.registrationAllocationRules,
        },
      }
    )
    expect(closedResponse.status(), await closedResponse.text()).toBe(200)

    const finalizeResponse = await adminPage.request.post(
      `/api/competitions/${competitionId}/registration-applications/finalize`
    )
    expect(finalizeResponse.status(), await finalizeResponse.text()).toBe(200)
    expect((await finalizeResponse.json()).createdTeams).toBe(2)

    const mandateSettingsResponse = await adminPage.request.patch(
      `/api/competitions/${competitionId}/registration-settings`,
      {
        data: {
          isPublic: true,
          registrationOpensAt: null,
          registrationClosesAt: null,
          registrationOverride: "CLOSED",
          registrationCapacity: 2,
          registrationClassBalanceMode:
            settings.registrationClassBalanceMode,
          mandateOpensAt: null,
          mandateClosesAt: null,
          mandateOverride: "OPEN",
          classes: settings.registrationClasses,
          formFields: settings.registrationFormFields,
          allocationRules: settings.registrationAllocationRules,
        },
      }
    )
    expect(
      mandateSettingsResponse.status(),
      await mandateSettingsResponse.text()
    ).toBe(200)

    const assignmentsResponse = await page.request.get(
      "/api/representative/teams"
    )
    expect(assignmentsResponse.status()).toBe(200)
    const assignments = await assignmentsResponse.json()
    const assignment = assignments.find(
      (item: { team: { name: string; competition: { id: string } } }) =>
        item.team.competition.id === competitionId &&
        item.team.name === "Avalik testvõistkond 3"
    )
    expect(assignment).toBeTruthy()

    await page.goto(`/dashboard/representative/teams/${assignment.team.id}`)
    await expect(page.getByLabel("Maakond")).toHaveValue("Raplamaa")
    await expect(page.getByLabel("Maakond")).toBeDisabled()
    await page
      .getByLabel("Kontaktisiku e-post")
      .fill("rapla@example.com")
    await page.getByRole("button", { name: "+ Lisa liige" }).click()
    await page.getByLabel("Liige 1 nimi").fill(otherOrganizer.name)
    await page.getByLabel("Liige 1 e-post").fill(otherOrganizer.email)
    await page.getByLabel("Liige 1 sünniaeg").fill("2010-05-02")
    await page.getByRole("button", { name: "Esita mandaat" }).click()
    await expect(
      page.getByText("Mandaat esitatud korraldajale")
    ).toBeVisible()
    await expect(page.getByText("Kontoga seotud liikmed")).toHaveCount(0)

    const conflictingAssignment = assignments.find(
      (item: { team: { name: string; competition: { id: string } } }) =>
        item.team.competition.id === competitionId &&
        item.team.name === "Avalik testvõistkond 2"
    )
    expect(conflictingAssignment).toBeTruthy()
    const conflictingTeamResponse = await page.request.get(
      `/api/representative/teams/${conflictingAssignment.team.id}`
    )
    expect(conflictingTeamResponse.status()).toBe(200)
    const conflictingTeam = await conflictingTeamResponse.json()
    const duplicateMemberResponse = await page.request.patch(
      `/api/representative/teams/${conflictingAssignment.team.id}`,
      {
        data: {
          phase: "MANDATE",
          members: [],
          formValues: {
            ...conflictingTeam.formValues,
            contact_email: "tartu@example.com",
            members: [
              {
                name: otherOrganizer.name,
                email: otherOrganizer.email,
                birthDate: "2010-05-02",
              },
            ],
          },
        },
      }
    )
    expect(duplicateMemberResponse.status()).toBe(409)
    expect((await duplicateMemberResponse.json()).error).toContain(
      "on sellel võistlusel juba võistkonna"
    )

    const userResponse = await adminPage.request.post("/api/users", {
      data: otherOrganizer,
    })
    expect(userResponse.status(), await userResponse.text()).toBe(200)
    await page.reload()
    await expect(page.getByText("Kontoga seotud liikmed")).toBeVisible()

    const linkedTeamResultResponse = await adminPage.request.post(
      `/api/elements/${elementId}/results`,
      {
        data: {
          teamId: assignment.team.id,
          values: { aeg: "2:34" },
          exceptionLabel: null,
        },
      }
    )
    expect(
      linkedTeamResultResponse.status(),
      await linkedTeamResultResponse.text()
    ).toBe(200)

    await representativeContext.close()
    await adminContext.close()
  })

  test("seotud võistleja näeb oma tulemusi, kuid mitte haldust", async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()

    await login(page, otherOrganizer.email, otherOrganizer.password)

    await expect(
      page.getByRole("heading", { name: "Minu võistkonnad" })
    ).toBeVisible()
    await expect(
      page.getByText("Avalik testvõistkond 3", { exact: false })
    ).toBeVisible()
    await page
      .locator(`a[href^="/dashboard/teams/"][href$="/results"]`)
      .filter({ hasText: "Avalik testvõistkond 3" })
      .click()
    await expect(
      page.getByRole("heading", { name: "Võistkonna tulemused" })
    ).toBeVisible()
    await expect(
      page.getByRole("heading", { name: "Avalik testvõistkond 3" })
    ).toBeVisible()
    await expect(page.getByText("Kontrollpunkt 1", { exact: true })).toBeVisible()
    await expect(page.getByText("2:34", { exact: true })).toBeVisible()
    await expect(page.getByText("154p", { exact: true }).first()).toBeVisible()

    const otherTeamResultsResponse = await page.goto(
      `/dashboard/teams/${teamId}/results`
    )
    expect(otherTeamResultsResponse?.status()).toBe(404)

    const apiResponse = await page.request.get(`/api/competitions/${competitionId}`)
    expect(apiResponse.status()).toBe(403)

    const applyDefaultsResponse = await page.request.post(
      `/api/competitions/${competitionId}/apply-defaults`
    )
    expect(applyDefaultsResponse.status()).toBe(403)

    const visibilityResponse = await page.request.patch(
      `/api/competitions/${competitionId}/athlete-visibility`,
      { data: { revealAll: false } }
    )
    expect(visibilityResponse.status()).toBe(403)

    const teamImportResponse = await page.request.post(
      `/api/competitions/${competitionId}/teams/import`,
      { data: { rows: [{ code: "X", name: "Lubamatu võistkond" }] } }
    )
    expect(teamImportResponse.status()).toBe(403)

    const resultImportResponse = await page.request.post(
      `/api/competitions/${competitionId}/elements/${elementId}/results/import`,
      { data: {} }
    )
    expect(resultImportResponse.status()).toBe(403)

    const pageResponse = await page.goto(`/dashboard/competitions/${competitionId}`)
    expect(pageResponse?.status()).toBe(404)

    await context.close()
  })
})
