"use client"

import { useState } from "react"

export default function ProfilePage() {
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setSuccess(false)

    if (newPassword !== confirmPassword) {
      setError("Uued paroolid ei kattu")
      return
    }
    if (newPassword.length < 6) {
      setError("Uus parool peab olema vähemalt 6 tähemärki")
      return
    }

    setSaving(true)
    try {
      const res = await fetch("/api/users/me/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setSuccess(true)
        setCurrentPassword("")
        setNewPassword("")
        setConfirmPassword("")
      } else {
        setError(data.error ?? "Viga parooli muutmisel")
      }
    } catch {
      setError("Serveri viga")
    }
    setSaving(false)
  }

  return (
    <div className="max-w-md">
      <h1 className="text-xl font-bold text-gray-900 mb-6">Profiil</h1>

      <form onSubmit={handleSubmit} className="bg-white border rounded-xl p-5 space-y-4">
        <h3 className="font-semibold text-gray-900">Muuda parooli</h3>

        <div>
          <label className="text-xs text-gray-500 mb-1 block">Praegune parool *</label>
          <input type="password" required value={currentPassword}
            onChange={e => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="••••••••"
            className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Uus parool *</label>
          <input type="password" required value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            autoComplete="new-password"
            placeholder="vähemalt 6 tähemärki"
            className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Korda uut parooli *</label>
          <input type="password" required value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            placeholder="••••••••"
            className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}
        {success && <p className="text-green-600 text-sm">✓ Parool muudetud</p>}

        <button type="submit" disabled={saving}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
          {saving ? "Salvestan..." : "Muuda parooli"}
        </button>
      </form>
    </div>
  )
}
