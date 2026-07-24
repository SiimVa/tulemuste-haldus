export class FormulaError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "FormulaError"
  }
}

type TokenType = "number" | "identifier" | "operator" | "leftParen" | "rightParen" | "comma" | "eof"
type Token = { type: TokenType; value: string }

const MAX_FORMULA_LENGTH = 1000
const MAX_TOKENS = 512
const MAX_DEPTH = 64

const isIdentifierStart = (char: string) => /[\p{L}_]/u.test(char)
const isIdentifierPart = (char: string) => /[\p{L}\p{N}_]/u.test(char)

function tokenize(formula: string): Token[] {
  if (!formula.trim()) throw new FormulaError("Valem on tühi")
  if (formula.length > MAX_FORMULA_LENGTH) throw new FormulaError("Valem on liiga pikk")

  const tokens: Token[] = []
  let index = 0

  while (index < formula.length) {
    const char = formula[index]
    if (/\s/u.test(char)) {
      index += 1
      continue
    }

    const numberMatch = formula
      .slice(index)
      .match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/)
    if (numberMatch) {
      tokens.push({ type: "number", value: numberMatch[0] })
      if (tokens.length > MAX_TOKENS) throw new FormulaError("Valem on liiga keeruline")
      index += numberMatch[0].length
      continue
    }

    if (isIdentifierStart(char)) {
      let end = index + 1
      while (end < formula.length && isIdentifierPart(formula[end])) end += 1
      tokens.push({ type: "identifier", value: formula.slice(index, end) })
      if (tokens.length > MAX_TOKENS) throw new FormulaError("Valem on liiga keeruline")
      index = end
      continue
    }

    if ("+-*/%^".includes(char)) tokens.push({ type: "operator", value: char })
    else if (char === "(") tokens.push({ type: "leftParen", value: char })
    else if (char === ")") tokens.push({ type: "rightParen", value: char })
    else if (char === ",") tokens.push({ type: "comma", value: char })
    else throw new FormulaError(`Lubamatu märk valemis: ${char}`)

    index += 1
    if (tokens.length > MAX_TOKENS) throw new FormulaError("Valem on liiga keeruline")
  }

  tokens.push({ type: "eof", value: "" })
  return tokens
}

function finite(value: number): number {
  if (!Number.isFinite(value)) throw new FormulaError("Valemi tulemus ei ole lõplik arv")
  return value
}

class FormulaParser {
  private index = 0
  private depth = 0

  constructor(
    private readonly tokens: Token[],
    private readonly variables: Readonly<Record<string, number>>
  ) {}

  parse(): number {
    const result = this.parseAdditive()
    if (this.current().type !== "eof") throw new FormulaError("Valemi lõpus on ootamatu väärtus")
    return finite(result)
  }

  private current(): Token {
    return this.tokens[this.index]
  }

  private consume(): Token {
    const token = this.current()
    this.index += 1
    return token
  }

  private parseAdditive(): number {
    let value = this.parseMultiplicative()
    while (this.current().type === "operator" && ["+", "-"].includes(this.current().value)) {
      const operator = this.consume().value
      const right = this.parseMultiplicative()
      value = finite(operator === "+" ? value + right : value - right)
    }
    return value
  }

  private parseMultiplicative(): number {
    let value = this.parsePower()
    while (this.current().type === "operator" && ["*", "/", "%"].includes(this.current().value)) {
      const operator = this.consume().value
      const right = this.parsePower()
      if (operator === "*") value = finite(value * right)
      else if (operator === "/") value = finite(value / right)
      else value = finite(value % right)
    }
    return value
  }

  private parsePower(): number {
    const left = this.parseUnary()
    if (this.current().type === "operator" && this.current().value === "^") {
      this.consume()
      return finite(left ** this.parsePower())
    }
    return left
  }

  private parseUnary(): number {
    if (this.current().type === "operator" && ["+", "-"].includes(this.current().value)) {
      const operator = this.consume().value
      const value = this.parseUnary()
      return operator === "-" ? finite(-value) : value
    }
    return this.parsePrimary()
  }

  private parsePrimary(): number {
    this.depth += 1
    if (this.depth > MAX_DEPTH) throw new FormulaError("Valem on liiga sügavalt pesastatud")

    try {
      const token = this.consume()
      if (token.type === "number") return finite(Number(token.value))

      if (token.type === "identifier") {
        if (this.current().type === "leftParen") return this.parseFunction(token.value)
        if (!Object.prototype.hasOwnProperty.call(this.variables, token.value)) {
          throw new FormulaError(`Tundmatu muutuja: ${token.value}`)
        }
        return finite(Number(this.variables[token.value]))
      }

      if (token.type === "leftParen") {
        const value = this.parseAdditive()
        if (this.consume().type !== "rightParen") throw new FormulaError("Sulgev sulg puudub")
        return value
      }

      throw new FormulaError("Valemis on ootamatu väärtus")
    } finally {
      this.depth -= 1
    }
  }

  private parseFunction(name: string): number {
    const allowed = ["min", "max", "floor", "round", "abs"]
    if (!allowed.includes(name)) throw new FormulaError(`Lubamatu funktsioon: ${name}`)

    this.consume() // (
    const args: number[] = []
    if (this.current().type !== "rightParen") {
      while (true) {
        args.push(this.parseAdditive())
        if (this.current().type !== "comma") break
        this.consume()
      }
    }
    if (this.consume().type !== "rightParen") throw new FormulaError("Funktsiooni sulgev sulg puudub")

    if ((name === "min" || name === "max") && args.length < 1) {
      throw new FormulaError(`${name} vajab vähemalt ühte argumenti`)
    }
    if (["floor", "round", "abs"].includes(name) && args.length !== 1) {
      throw new FormulaError(`${name} vajab täpselt ühte argumenti`)
    }

    if (name === "min") return finite(Math.min(...args))
    if (name === "max") return finite(Math.max(...args))
    if (name === "floor") return finite(Math.floor(args[0]))
    if (name === "round") return finite(Math.round(args[0]))
    return finite(Math.abs(args[0]))
  }
}

export function evaluateFormula(
  formula: string,
  variables: Readonly<Record<string, number>>
): number {
  return new FormulaParser(tokenize(formula), variables).parse()
}
