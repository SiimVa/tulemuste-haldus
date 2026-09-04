import { redirect } from "next/navigation"
import { NotificationList } from "@/components/notifications/NotificationList"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export default async function NotificationsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const notifications = await prisma.notification.findMany({
    where: { userId: session.user.id },
    include: { competition: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  })

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Teavitused</h1>
        <p className="mt-1 text-sm text-gray-500">
          Registreerimise, mandaadi ja aktiivsete võistluste tähtsad muudatused.
        </p>
      </div>
      <NotificationList
        items={notifications.map((notification) => ({
          id: notification.id,
          title: notification.title,
          message: notification.message,
          href: notification.href,
          readAt: notification.readAt?.toISOString() ?? null,
          createdAt: notification.createdAt.toISOString(),
          competitionName: notification.competition?.name ?? null,
        }))}
      />
    </div>
  )
}
