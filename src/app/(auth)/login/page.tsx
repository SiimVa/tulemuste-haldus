"use client"

import { Suspense, useEffect, useState } from "react"
import { getProviders, signIn } from "next-auth/react"
import { useRouter, useSearchParams } from "next/navigation"

function LoginForm() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState<"credentials" | "google" | null>(null)
  const [googleEnabled, setGoogleEnabled] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const requestedCallback = searchParams.get("callbackUrl")
  const callbackUrl =
    requestedCallback?.startsWith("/") && !requestedCallback.startsWith("//")
      ? requestedCallback
      : "/dashboard"

  useEffect(() => {
    getProviders()
      .then((providers) => setGoogleEnabled(Boolean(providers?.google)))
      .catch(() => setGoogleEnabled(false))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading("credentials")
    setError("")

    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    })

    if (res?.error) {
      setError("Vale e-post või parool")
      setLoading(null)
    } else {
      router.push(callbackUrl)
    }
  }

  async function handleGoogleSignIn() {
    setError("")
    setLoading("google")
    await signIn("google", { redirectTo: callbackUrl })
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-xl shadow-sm border w-full max-w-md">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Logi sisse</h1>
        <p className="text-gray-500 text-sm mb-6">Võistluste haldussüsteem</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">E-post</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="admin@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Parool</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && (
            <div className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading !== null}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading === "credentials" ? "Sisenemine..." : "Logi sisse"}
          </button>
        </form>

        {googleEnabled && (
          <>
            <div className="flex items-center gap-3 my-5">
              <div className="h-px bg-gray-200 flex-1" />
              <span className="text-xs text-gray-400">või</span>
              <div className="h-px bg-gray-200 flex-1" />
            </div>
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading !== null}
              className="w-full border border-gray-300 bg-white text-gray-700 py-2 px-4 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {loading === "google" ? "Suunan Google’isse..." : "Jätka Google’iga"}
            </button>
          </>
        )}

        <div className="mt-6 pt-4 border-t text-center">
          <p className="text-sm text-gray-500">
            Kohtunik või võistleja?{" "}
            <span className="text-gray-400">Kasuta saadetud linki.</span>
          </p>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50 text-sm text-gray-400">
          Laadin...
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  )
}
