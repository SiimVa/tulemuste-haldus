import { exampleTimeMeta } from "../src/lib/pointFields"
export function examplePointFields() {
  const common = { rankingPriority: null, formula: "", displayAsTime: false, validation: { required: true }, fieldHigherIsBetter: null }
  return [
    { ...common, name: "nato", label: "NATO tähestiku kasutamine", type: "POINTS_SELECT", meta: JSON.stringify({ options: [{ id: "yes", label: "Kasutab", points: 2 }, { id: "partly", label: "Kasutab osaliselt", points: 1 }, { id: "no", label: "Ei kasuta", points: 0 }] }) },
    { ...common, name: "sedelid", label: "Õigesti avatud sedeleid", type: "NUMBER", validation: { required: true, min: 0, max: 9, integer: true } },
    { ...common, name: "lahendus", label: "Lahendussõna leidmine", type: "POINTS_SELECT", meta: JSON.stringify({ options: [{ id: "yes", label: "Leidis", points: 5 }, { id: "no", label: "Ei leidnud", points: 0 }] }) },
    { ...common, name: "aeg", label: "Aeg", type: "TIME_POINTS", meta: JSON.stringify(exampleTimeMeta) },
    { ...common, name: "kokku", label: "Punkte kokku", type: "COMPUTED", rankingPriority: 1, fieldHigherIsBetter: true, formula: "nato + sedelid * 2 + lahendus + aeg", validation: {} },
  ]
}
