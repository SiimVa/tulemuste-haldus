type ErrorClass = abstract new (...args: never[]) => Error

// Plain Error and the listed classes carry messages written for users. Other
// errors (Prisma, TypeError, ...) can reveal queries or code and are replaced.
export function userErrorMessage(
  error: unknown,
  fallback: string,
  userErrors: readonly ErrorClass[] = []
): string {
  if (
    error instanceof Error &&
    (error.constructor === Error || userErrors.some((type) => error instanceof type))
  ) {
    return error.message
  }
  return fallback
}
