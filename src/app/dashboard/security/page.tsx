import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { SecurityLogView } from "@/components/security/SecurityLogView"

export const dynamic = "force-dynamic"

export default async function SecurityPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")
  if (session.user.role !== "ADMIN") redirect("/dashboard")
  return <SecurityLogView />
}
