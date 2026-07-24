import { FlatCompat } from "@eslint/eslintrc"
import { fileURLToPath } from "node:url"
import path from "node:path"

const currentFile = fileURLToPath(import.meta.url)
const currentDirectory = path.dirname(currentFile)
const compat = new FlatCompat({ baseDirectory: currentDirectory })

const eslintConfig = [
  {
    ignores: [".next/**", ".test-dist/**", "node_modules/**", "next-env.d.ts"],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "react/no-unescaped-entities": "off",
    },
  },
]

export default eslintConfig
