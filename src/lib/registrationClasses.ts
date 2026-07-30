export class RegistrationClassError extends Error {}

/**
 * Null klassi tähendab klassideta võistlust. Üks aktiivne klass määratakse
 * automaatselt ning mitme klassi puhul peab registreerija tegema kehtiva valiku.
 */
export function resolveRegistrationClass(
  activeClassIds: string[],
  requestedClassId: string | null
): string | null {
  if (activeClassIds.length === 0) return null
  if (activeClassIds.length === 1) return activeClassIds[0]
  if (!requestedClassId) {
    throw new RegistrationClassError("Vali klass")
  }
  if (!activeClassIds.includes(requestedClassId)) {
    throw new RegistrationClassError(
      "Valitud klass ei kuulu sellele võistlusele"
    )
  }
  return requestedClassId
}
