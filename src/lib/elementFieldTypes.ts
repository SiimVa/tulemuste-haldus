export const ELEMENT_FIELD_TYPES = [
  { value: "NUMBER", label: "Arv" },
  { value: "TIME", label: "Aeg (h:mm:ss)" },
  { value: "TIME_RANGE", label: "Aeg (kestvus)" },
  { value: "TIME_POINTS", label: "Aja hindamine vahemikena" },
  { value: "POINTS_SELECT", label: "Valik punktidega" },
  { value: "ESTIMATION", label: "Väärtuste hindamine veaprotsendi järgi" },
  { value: "TEXT", label: "Tekst" },
  { value: "COMPUTED", label: "Arvutatud" },
]
export const elementFieldLabel = (type: string) => ELEMENT_FIELD_TYPES.find(f => f.value === type)?.label ?? type
