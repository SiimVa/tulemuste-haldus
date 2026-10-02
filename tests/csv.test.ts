import assert from "node:assert/strict"
import test from "node:test"
import { csvCell, csvRow } from "../src/lib/csv"

test("CSV cells neutralize formulas but keep numbers numeric", () => {
  assert.equal(csvCell('=HYPERLINK("https://evil.example","x")'), `"'=HYPERLINK(""https://evil.example"",""x"")"`)
  assert.equal(csvCell("\t@SUM(A1)"), `"'\t@SUM(A1)"`)
  assert.equal(csvCell("+1+1"), `"'+1+1"`)
  assert.equal(csvCell("-2.50"), '"-2.50"')
  assert.equal(csvCell(-2), '"-2"')
  assert.equal(csvCell(null), '""')
  assert.equal(csvRow(["VK 1", "Öö, tiim", 3]), '"VK 1","Öö, tiim","3"')
})
