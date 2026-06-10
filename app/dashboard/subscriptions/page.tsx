'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function SubscriptionsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<any>(null)
  const [buying, setBuying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { loadProfile() }, [])

  const loadProfile = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/me')
      if (!res.ok) { router.push('/login'); return }
      const { user } = await res.json()
      setProfile(user?.profile || null)
    } catch {
      setError('Failed to load profile')
    } finally { setLoading(false) }
  }

  const buyWeek = async () => {
    setBuying(true); setError(null)
    try {
      const res = await fetch('/api/subscription', { method: 'POST' })
      if (!res.ok) {
        const d = await res.json().catch(() => null)
        setError(d?.error || 'Purchase failed')
      } else {
        await loadProfile()
      }
    } catch {
      setError('Purchase failed')
    } finally { setBuying(false) }
  }

  if (loading) return (<div className="min-h-screen bg-[#0c0c10] text-white flex items-center justify-center">Loading…</div>)

  return (
    <div className="min-h-screen bg-[#0c0c10] text-white">
      <header className="flex items-center justify-between px-4 md:px-6 py-4 border-b border-[#222230]">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/dashboard')} className="text-sm text-gray-400 hover:text-yellow-500">← Dashboard</button>
          <span className="text-gray-600">/</span>
          <h1 className="text-lg font-extrabold">Subscriptions</h1>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 md:px-6 py-6">
        {/* Week Progress */}
        <div className="bg-[#17171f] border border-[#222230] rounded-2xl p-6 mb-6 space-y-5">
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-white">Week Progress</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[#0c0c10] border border-[#222230] rounded-xl p-4 text-center">
                <p className="text-xs text-gray-400 uppercase tracking-wider font-mono">Current Week</p>
                <p className="text-3xl font-extrabold text-yellow-400 mt-2">1</p>
              </div>
              <div className="bg-[#0c0c10] border border-[#222230] rounded-xl p-4 text-center">
                <p className="text-xs text-gray-400 uppercase tracking-wider font-mono">Weeks Unlocked</p>
                <p className="text-3xl font-extrabold text-green-400 mt-2">{profile?.paid_weeks ?? 1}</p>
              </div>
            </div>
          </div>

          {/* Days left indicator */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-400">Days remaining in this week</p>
              <span className="text-2xl font-extrabold text-white font-mono">7 / 7</span>
            </div>
            <div className="w-full bg-[#0c0c10] border border-[#222230] rounded-full h-3 overflow-hidden">
              <div className="bg-gradient-to-r from-green-500 to-yellow-500 h-full" style={{ width: '100%' }}></div>
            </div>
            <p className="text-xs text-gray-500 text-center">New plan arrives in 7 days</p>
          </div>
        </div>

        {/* Subscription Control */}
        <div className="bg-[#17171f] border border-[#222230] rounded-2xl p-6 space-y-4">
          <h2 className="text-white font-bold">Manage Subscription</h2>
          <p className="text-gray-400">You have <span className="font-mono text-yellow-400">{profile?.paid_weeks ?? 1}</span> week(s) unlocked</p>
          <p className="text-sm text-gray-500">Each purchase unlocks the next week's AI-generated plan with continuous improvement.</p>
          {error && <div className="text-red-400 text-sm">{error}</div>}
          <div className="flex gap-3">
            <button onClick={buyWeek} disabled={buying} className="px-4 py-2 bg-yellow-500 text-black rounded-md font-semibold hover:bg-yellow-400">{buying ? 'Purchasing…' : 'Buy Next Week'}</button>
            <button onClick={() => router.push('/dashboard/plans')} className="px-4 py-2 bg-[#17171f] border border-[#222230] rounded-md hover:border-yellow-500">View All Plans</button>
          </div>
        </div>
      </main>
    </div>
  )
}
