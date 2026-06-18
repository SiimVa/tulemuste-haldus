"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"

type User = { id: string; email: string; name: string; role: string; createdAt: string }

export default function UsersPage() {
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ name: "", email: "", password: "" })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    fetch("/api/users")
      .then(r => {
        if (r.status === 403) { router.replace("/dashboard"); return null }
        return r.json()
      })
      .then(data => { if (data) setUsers(data) })
      .finally(() => setLoading(false))
  }, [router])

  async function createUser(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError("")
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })
    try {
      const data = await res.json()
      if (res.ok) {
        setUsers([...users, data])
        setForm({ name: "", email: "", password: "" })
      } else {
        setError(data.error ?? "Viga")
      }
    } catch {
      setError("Serveri viga")
    }
    setSaving(false)
  }

  async function deleteUser(id: string) {
    if (!confirm("Kustuta kasutaja?")) return
    const res = await fetch(`/api/users/${id}`, { method: "DELETE" })
    if (res.ok) setUsers(users.filter(u => u.id !== id))
  }

  async function resetPassword(id: string, name: string) {
    const password = prompt(`Uus parool kasutajale "${name}" (vähemalt 6 tähemärki):`)
    if (!password) return
    const res = await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    })
    if (res.ok) {
      alert(`✓ Parool muudetud kasutajale "${name}"`)
    } else {
      const data = await res.json().catch(() => ({}))
      alert(data.error ?? "Viga parooli muutmisel")
    }
  }

  if (loading) return <div className="text-gray-400 text-sm">Laadin...</div>

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-6">Kasutajahaldus</h1>

      {/* Uue korraldaja vorm */}
      <form onSubmit={createUser} className="bg-white border rounded-xl p-5 mb-6 space-y-4">
        <h3 className="font-semibold text-gray-900">Lisa korraldaja</h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Nimi *</label>
            <input type="text" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="Jüri Mets"
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">E-post *</label>
            <input type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
              placeholder="jyri@example.com"
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Parool *</label>
            <input type="password" required value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
              placeholder="••••••••"
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button type="submit" disabled={saving}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
          {saving ? "Loon..." : "Lisa korraldaja"}
        </button>
      </form>

      {/* Kasutajate nimekiri */}
      <div className="bg-white border rounded-xl divide-y">
        {users.map(u => (
          <div key={u.id} className="px-5 py-3 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${u.role === "ADMIN" ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-600"}`}>
                  {u.role === "ADMIN" ? "Admin" : "Korraldaja"}
                </span>
                <span className="font-medium text-gray-900 text-sm">{u.name}</span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">{u.email}</p>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => resetPassword(u.id, u.name)}
                className="text-xs text-gray-400 hover:text-blue-600 px-2 py-1.5">
                Muuda parooli
              </button>
              {u.role !== "ADMIN" && (
                <button onClick={() => deleteUser(u.id)}
                  className="text-xs text-red-400 hover:text-red-600 px-2 py-1.5">
                  Kustuta
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
