import { AsyncLocalStorage } from "node:async_hooks"
import { createHmac } from "node:crypto"
import { isIP } from "node:net"
import { prisma } from "./prisma"
import {
  SECURITY_RETENTION_DAYS, securityTargetIds,
  type RateLimitPolicy, type SecurityOutcome,
} from "./security"

type AuditContext = {
  actorUserId?: string | null
  actorTokenId?: string | null
  targetIds: Record<string, string>
}
export const securityContext = new AsyncLocalStorage<AuditContext>()

// Call after authorization when a token, rather than the session, authorized the write.
export function setSecurityActor(actorUserId: string | null, actorTokenId: string | null = null) {
  const context = securityContext.getStore()
  if (context) Object.assign(context, { actorUserId, actorTokenId })
}

export function setSecurityTargets(targets: Record<string, unknown>) {
  const context = securityContext.getStore()
  if (context) Object.assign(context.targetIds, securityTargetIds(targets))
}

export function securityFingerprint(scope: string, value: string): string {
  const secret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET
  if (!secret) throw new Error("Security configuration missing")
  return createHmac("sha256", secret).update(JSON.stringify([scope, value])).digest("hex")
}

export function requestFingerprint(headers: Headers): string {
  // Railway's edge sets X-Real-IP. Direct/local deployments do not trust caller headers.
  // Keep non-Railway deployments in the shared fallback bucket until a trusted proxy is configured.
  const value = process.env.RAILWAY_ENVIRONMENT_ID ? headers.get("x-real-ip") : null
  const address = value && isIP(value) ? value : "unknown"
  return securityFingerprint("client", address)
}

export async function consumeRateLimit(policy: RateLimitPolicy, identity: string) {
  const key = securityFingerprint(policy.scope, identity)
  // Atomic, shared by all app instances. DB time avoids clock skew between replicas.
  const [bucket] = await prisma.$queryRaw<Array<{ count: number; expiresAt: Date; now: Date }>>`
    INSERT INTO "RateLimitBucket" ("key", "count", "expiresAt")
    VALUES (${key}, 1, CURRENT_TIMESTAMP + make_interval(secs => ${policy.seconds}::double precision))
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimitBucket"."expiresAt" <= CURRENT_TIMESTAMP THEN 1
        ELSE LEAST("RateLimitBucket"."count" + 1, ${policy.limit + 2}) END,
      "expiresAt" = CASE WHEN "RateLimitBucket"."expiresAt" <= CURRENT_TIMESTAMP
        THEN CURRENT_TIMESTAMP + make_interval(secs => ${policy.seconds}::double precision)
        ELSE "RateLimitBucket"."expiresAt" END
    RETURNING "count", "expiresAt", CURRENT_TIMESTAMP AS "now"
  `
  return {
    allowed: bucket.count <= policy.limit,
    firstBlocked: bucket.count === policy.limit + 1,
    retryAfter: Math.min(policy.seconds, Math.max(1, Math.ceil((bucket.expiresAt.getTime() - bucket.now.getTime()) / 1000))),
  }
}

export type SecurityEventInput = {
  action: string
  outcome: SecurityOutcome
  route: string // Code-defined route template only, never request.url.
  method: string
  status?: number
  fingerprint?: string
} & Partial<AuditContext>

export async function recordSecurityEvent(event: SecurityEventInput) {
  return prisma.securityEvent.create({ data: {
    action: event.action, outcome: event.outcome, route: event.route, method: event.method,
    status: event.status, fingerprint: event.fingerprint,
    actorUserId: event.actorUserId, actorTokenId: event.actorTokenId,
    targetIds: securityTargetIds(event.targetIds ?? {}),
  } })
}

export async function finishSecurityEvent(id: string, status: number, outcome: SecurityOutcome, started: number) {
  try {
    const context = securityContext.getStore()
    await prisma.securityEvent.update({ where: { id }, data: {
      status, outcome, durationMs: Math.min(2147483647, Math.max(0, Date.now() - started)),
      ...(context ? {
        actorUserId: context.actorUserId, actorTokenId: context.actorTokenId,
        targetIds: securityTargetIds(context.targetIds),
      } : {}),
    } })
  } catch {
    // Preserve STARTED if the outcome cannot be persisted. No exception/body/URL in logs.
    console.error("Security audit completion failed", id)
  }
}

export async function purgeExpiredSecurityData() {
  const before = new Date(Date.now() - SECURITY_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  const [events, buckets] = await prisma.$transaction([
    prisma.securityEvent.deleteMany({ where: { createdAt: { lt: before } } }),
    prisma.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
  ])
  return { deletedSecurityEvents: events.count, deletedRateLimitBuckets: buckets.count }
}
