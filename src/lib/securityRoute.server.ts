import { auth } from "@/lib/auth"
import { apiRateLimitPolicy, securityAction, securityOutcome, securityTargetIds } from "./security"
import {
  consumeRateLimit, finishSecurityEvent, recordSecurityEvent,
  requestFingerprint, securityContext,
} from "./security.server"

export function withSecurityRoute<P extends Record<string, string> = Record<string, string>>(
  route: string,
  handler: (request: Request, context: { params: Promise<P> }) => Promise<Response>,
) {
  return async (request: Request, context: { params: Promise<P> }): Promise<Response> => {
    const started = Date.now()
    try {
      const session = await auth()
      const fingerprint = requestFingerprint(request.headers)
      const actorUserId = session?.user?.id ?? null
      const targetIds = securityTargetIds(context?.params ? await context.params : {})
      const action = securityAction(route, request.method)
      const baseEvent = { action, route, method: request.method, actorUserId, fingerprint, targetIds }
      const limit = await consumeRateLimit(
        apiRateLimitPolicy(route, request.method, Boolean(actorUserId)),
        actorUserId ? `user:${actorUserId}` : `client:${fingerprint}`,
      )
      if (!limit.allowed) {
        if (limit.firstBlocked) await recordSecurityEvent({ ...baseEvent, outcome: "RATE_LIMITED", status: 429 })
        return Response.json({ error: "Liiga palju päringuid. Palun proovi hiljem uuesti." }, {
          status: 429, headers: { "Retry-After": String(limit.retryAfter), "Cache-Control": "no-store" },
        })
      }
      return await securityContext.run({ actorUserId, actorTokenId: null, targetIds }, async () => {
        // Write-ahead audit for mutations/exports; if storage fails, do not execute the operation.
        const audit = action !== "API_READ" && action !== "AUDIT_READ"
          ? await recordSecurityEvent({ ...baseEvent, outcome: "STARTED" }) : null
        let response: Response
        try {
          response = await handler(request, context)
        } catch {
          response = Response.json({ error: "Serveri viga" }, { status: 500 })
        }
        const outcome = securityOutcome(response.status)
        if (audit) await finishSecurityEvent(audit.id, response.status, outcome, started)
        else if (response.status >= 400 || action === "AUDIT_READ") await recordSecurityEvent({ ...baseEvent, outcome, status: response.status })
        return response
      })
    } catch {
      console.error("Security service unavailable")
      return Response.json({ error: "Teenus pole ajutiselt saadaval. Proovi hiljem uuesti." }, {
        status: 503, headers: { "Cache-Control": "no-store" },
      })
    }
  }
}
