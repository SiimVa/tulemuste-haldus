import { expect, test } from "@playwright/test"
import { installNumericInputBehavior, normalizeNumericInput } from "../src/lib/numericInput"

test.beforeEach(async ({ page }) => {
  await page.setContent(`
    <input id="number" type="number" value="0" step="any">
    <input id="decimal" type="text" inputmode="decimal" value="0">
    <input id="code" type="text" value="001">
    <input id="duration" type="text" inputmode="numeric" value="0:00">
    <output id="received"></output>
  `)
  await page.addScriptTag({ content: `
    const normalizeNumericInput = ${normalizeNumericInput.toString()};
    (${installNumericInputBehavior.toString()})(document);
    document.addEventListener('input', event => {
      document.querySelector('#received').textContent = event.target.value;
    });
  ` })
})

test("zero is replaced while typing and change handlers receive the normalized value", async ({ page }) => {
  for (const id of ["number", "decimal"]) {
    const input = page.locator(`#${id}`)
    await input.focus()
    await input.press("End")
    await input.pressSequentially("1")
    await expect(input).toHaveValue("1")
    await expect(page.locator("#received")).toHaveText("1")
    await input.pressSequentially("0")
    await expect(input).toHaveValue("10")
    await input.fill("0")
    await input.press("Home")
    await input.pressSequentially("2")
    await expect(input).toHaveValue("2")
  }
})

test("pasted leading zeroes are removed and decimal fractions remain editable", async ({ page }) => {
  for (const id of ["number", "decimal"]) {
    const input = page.locator(`#${id}`)
    await input.fill("00012")
    await expect(input).toHaveValue("12")
    await expect(page.locator("#received")).toHaveText("12")
    await input.fill("0")
    await input.press("End")
    await input.pressSequentially(".05")
    await expect(input).toHaveValue("0.05")
    await input.fill("")
    await expect(input).toHaveValue("")
    await input.pressSequentially("-0.5")
    await expect(input).toHaveValue("-0.5")
  }
  await page.locator("#decimal").fill("00,50")
  await expect(page.locator("#decimal")).toHaveValue("0,50")
})

test("codes and formatted durations retain their zeroes", async ({ page }) => {
  await page.locator("#code").fill("00012")
  await expect(page.locator("#code")).toHaveValue("00012")
  await page.locator("#duration").fill("00:05")
  await expect(page.locator("#duration")).toHaveValue("00:05")
})
