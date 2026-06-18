type CalcParams = {
  higherIsBetter?: boolean
  minPoints?: number
  fixedPoints?: number[]
  totalElements?: number
}

type Props = {
  type: string
  params: string
  customFormula?: string | null
  maxValue?: number | null
}

function Var({ children }: { children: React.ReactNode }) {
  return <span className="italic text-gray-700">{children}</span>
}
function Kw({ children }: { children: React.ReactNode }) {
  return <span className="font-semibold text-blue-700">{children}</span>
}
function Eq({ children }: { children: React.ReactNode }) {
  return <div className="font-mono text-sm bg-gray-50 border rounded px-3 py-2 my-1">{children}</div>
}
function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-gray-500 mt-1">{children}</p>
}

export function CalcFormulaDisplay({ type, params, customFormula, maxValue }: Props) {
  let p: CalcParams = {}
  try { p = JSON.parse(params) } catch {}

  const maxP = maxValue ?? "maxP"
  const minP = p.minPoints ?? "minP"
  const higher = p.higherIsBetter

  if (type === "ABSOLUTE_TIME") {
    return (
      <div>
        <Eq><Kw>tulemus</Kw> = tegelik mõõdetud aeg</Eq>
        <Note>Väiksem aeg = parem koht. Punktidena kasutatakse otse mõõdetud väärtust.</Note>
      </div>
    )
  }

  if (type === "ABSOLUTE_POINTS") {
    return (
      <div>
        <Eq><Kw>tulemus</Kw> = tegelik mõõdetud punktisumma</Eq>
        <Note>Suurem arv = parem koht. Punktidena kasutatakse otse mõõdetud väärtust.</Note>
      </div>
    )
  }

  if (type === "ABSOLUTE_PENALTY") {
    return (
      <div>
        <Eq><Kw>karistuspunkte</Kw> = tegelik mõõdetud väärtus</Eq>
        <Note>Väiksem väärtus = parem koht. Väärtust kasutatakse otse karistuspunktidena.</Note>
      </div>
    )
  }

  if (type === "RELATIVE_RANKING") {
    return (
      <div>
        <Eq>
          <Kw>P</Kw>(<Var>r</Var>) = <Var>{String(minP)}</Var> + ({String(maxP)} − <Var>{String(minP)}</Var>) × (<Var>n</Var> − <Var>r</Var>) / (<Var>n</Var> − 1)
        </Eq>
        <div className="text-xs text-gray-500 mt-2 space-y-0.5">
          <p><Var>r</Var> = koha number ({higher ? "suurem väärtus = väiksem r" : "väiksem väärtus = väiksem r"})</p>
          <p><Var>n</Var> = arvestatavate võistkondade arv</p>
          <p><Var>{String(maxP)}</Var> = 1. koha punktid</p>
          <p><Var>{String(minP)}</Var> = viimase koha miinimumpunktid</p>
        </div>
      </div>
    )
  }

  if (type === "FIXED_RANKING") {
    const fixed: number[] = Array.isArray(p.fixedPoints) ? p.fixedPoints : []
    const k = fixed.length
    return (
      <div>
        {k > 0 && (
          <div className="mb-2">
            <p className="text-xs font-medium text-gray-600 mb-1">Fikseeritud kohad:</p>
            <div className="flex flex-wrap gap-1">
              {fixed.map((pts, i) => (
                <span key={i} className="text-xs font-mono bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded">
                  {i + 1}. → {pts}p
                </span>
              ))}
            </div>
          </div>
        )}
        {k > 0 ? (
          <>
            <Eq>
              <span className="text-gray-500">koht r ≤ {k}:</span>{" "}
              <Kw>P</Kw>(<Var>r</Var>) = <Var>P<sub>r</sub></Var> (fikseeritud)
            </Eq>
            <Eq>
              <span className="text-gray-500">koht r &gt; {k}:</span>{" "}
              <Kw>P</Kw>(<Var>r</Var>) = <Var>{String(fixed[k - 1] ?? "P_k")}</Var> + (<Var>{String(minP)}</Var> − <Var>{String(fixed[k - 1] ?? "P_k")}</Var>) × (<Var>r</Var> − {k}) / (<Var>n</Var> − {k})
            </Eq>
            <div className="text-xs text-gray-500 mt-2 space-y-0.5">
              <p><Var>r</Var> = koha number</p>
              <p><Var>n</Var> = arvestatavate võistkondade arv</p>
              <p><Var>{String(minP)}</Var> = viimase koha miinimumpunktid</p>
            </div>
          </>
        ) : (
          <Note>Fikseeritud punktid pole veel määratud.</Note>
        )}
      </div>
    )
  }

  if (type === "VALUE_BASED") {
    return (
      <div>
        <Eq>
          <Kw>P</Kw>(<Var>v</Var>) = <Var>{String(minP)}</Var> + ({String(maxP)} − <Var>{String(minP)}</Var>) × |<Var>v</Var> − <Var>v<sub>halv</sub></Var>| / (<Var>v<sub>parim</sub></Var> − <Var>v<sub>halv</sub></Var>)
        </Eq>
        <div className="text-xs text-gray-500 mt-2 space-y-0.5">
          <p><Var>v</Var> = võistkonna tulemusväärtus</p>
          <p><Var>v<sub>parim</sub></Var> = parim tulemus kõigist võistkondadest ({higher ? "suurim" : "väikseim"})</p>
          <p><Var>v<sub>halv</sub></Var> = halvim tulemus kõigist võistkondadest ({higher ? "väikseim" : "suurim"})</p>
          <p><Var>{String(maxP)}</Var> = parima võistkonna punktid</p>
          <p><Var>{String(minP)}</Var> = halvima võistkonna miinimumpunktid</p>
          <p className="mt-1 pt-1 border-t border-gray-100">Viigi korral (sama põhiväärtus):</p>
          <p className="text-gray-400 font-mono">N = (M − H) / (K + 1)</p>
          <p className="text-gray-400 font-mono">P<sub>lõplik</sub> = H + N × j</p>
          <p className="text-gray-400 mt-1">
            kus <Var>M</Var> = naabri grupi punktid · <Var>K</Var> = viikide arv · <Var>j</Var> = koht viikide seas (tiebreaker järgi)
          </p>
        </div>
      </div>
    )
  }

  if (type === "PERFORMANCE_BASED") {
    const total = p.totalElements ?? "N"
    return (
      <div>
        <Eq>
          <Kw>elemendi väärtus</Kw> = {String(maxP)} / {String(total)}
        </Eq>
        <Eq>
          <span className="text-gray-500">plusspunktid:</span>{" "}
          <Kw>P</Kw> = <Var>õige</Var> × <Var>elemendi_väärtus</Var>
        </Eq>
        <Eq>
          <span className="text-gray-500">karistuspunktid:</span>{" "}
          <Kw>P</Kw> = (<Var>{String(total)}</Var> − <Var>õige</Var>) × <Var>elemendi_väärtus</Var>
        </Eq>
        <div className="text-xs text-gray-500 mt-2 space-y-0.5">
          <p><Var>õige</Var> = õigesti sooritatud üksuste arv</p>
          <p><Var>{String(total)}</Var> = üksuste koguarv sooritusel</p>
          <p><Var>{String(maxP)}</Var> = elemendi maksimaalne punktiväärtus (täissooritus)</p>
        </div>
      </div>
    )
  }

  if (type === "CUSTOM") {
    return (
      <div>
        <Eq><Kw>P</Kw> = {customFormula ?? "valem puudub"}</Eq>
        <Note>Korraldaja defineeritud avaldis. Muutujad vastavad sisendväljadele.</Note>
      </div>
    )
  }

  return <Note>Valem pole saadaval selle arvutusmeetodi jaoks.</Note>
}
