'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function SubscriptionsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<any>(null)
  const [buying, setBuying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => { loadProfile() }, [])

  const loadProfile = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/me')
      if (!res.ok) { router.push('/login'); return }
      const { user } = await res.json()
      setProfile(user?.profile || null)
    } catch { setError('Failed to load profile') } 
    finally { setLoading(false) }
  }

  const buyWeek = async () => {
    setBuying(true); setError(null); setSuccess(false)
    try {
      // Simulated Payment Gateway Delay
      await new Promise(resolve => setTimeout(resolve, 1500))
      
      const res = await fetch('/api/subscription', { method: 'POST' })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'Payment gateway failed')
      
      await loadProfile()
      setSuccess(true)
    } catch (err: any) { setError(err.message) } 
    finally { setBuying(false) }
  }

  if (loading) return <div className="min-h-screen bg-[#0c0c10] text-yellow-500 flex items-center justify-center font-mono">Securing connection...</div>

  const nextWeek = (profile?.paid_weeks ?? 1) + 1

  return (
    <div className="min-h-screen bg-[#0c0c10] text-white">
      <header className="flex items-center justify-between px-4 md:px-6 py-4 border-b border-[#222230] sticky top-0 bg-[#0c0c10]/90 backdrop-blur-xl z-20">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/dashboard')} className="text-sm text-gray-400 hover:text-yellow-500 transition-colors">← Dashboard</button>
          <span className="text-gray-600">/</span>
          <h1 className="text-lg font-extrabold">Billing & <span className="text-yellow-500">Unlocks</span></h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 md:px-6 py-8 space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-500">
        
        {/* CURRENT STATUS */}
        <div className="bg-[#17171f] border border-[#222230] rounded-3xl p-6 md:p-8 text-center shadow-xl">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/10 mb-4">
            <span className="text-3xl">🛡️</span>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Account Active</h2>
          <p className="text-gray-400">You currently have full access to <span className="text-yellow-400 font-mono font-bold">Week {profile?.paid_weeks ?? 1}</span>.</p>
          <div className="mt-6 bg-[#0c0c10] rounded-full h-2 border border-[#222230] overflow-hidden">
            <div className="bg-gradient-to-r from-green-500 to-yellow-500 h-full w-full"></div>
          </div>
        </div>

        {/* UPGRADE CARD */}
        <div className="bg-gradient-to-br from-[#1c1c26] to-[#121218] border border-yellow-500/30 rounded-3xl p-6 md:p-8 shadow-[0_0_30px_rgba(234,179,8,0.05)] relative overflow-hidden">
          <div className="absolute top-0 right-0 bg-yellow-500 text-black text-[10px] font-extrabold uppercase tracking-widest px-4 py-1 rounded-bl-xl">Next Step</div>
          
          <h2 className="text-2xl font-bold text-white mb-1">Unlock Week {nextWeek}</h2>
          <p className="text-sm text-gray-400 mb-6">Continuous progression requires continuous recalculation.</p>

          <div className="space-y-4 mb-8">
            {[
              "AI recalculates your TDEE based on your new weight.",
              "Macronutrient ratios adjusted to break plateaus.",
              "Fresh 7-day meal plan with new recipes & variety.",
              "Next progression step unlocked in your workout split."
            ].map((feature, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="text-yellow-500 mt-0.5">✓</span>
                <span className="text-sm text-gray-300 leading-relaxed">{feature}</span>
              </div>
            ))}
          </div>

          <div className="flex items-end gap-2 mb-6 border-t border-[#222230] pt-6">
            <span className="text-4xl font-extrabold text-white">₹299</span>
            <span className="text-sm text-gray-500 font-mono mb-1">/ week</span>
          </div>

          {error && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-xl text-center">{error}</div>}
          {success && <div className="mb-4 p-3 bg-green-500/10 border border-green-500/30 text-green-400 text-sm rounded-xl text-center font-bold">🎉 Payment Successful! Week {nextWeek-1} Unlocked.</div>}

          <button onClick={buyWeek} disabled={buying || success} className="w-full py-4 bg-yellow-500 text-black font-extrabold text-lg rounded-xl hover:bg-yellow-400 transition-all shadow-[0_0_15px_rgba(234,179,8,0.2)] disabled:opacity-50 disabled:shadow-none flex justify-center items-center gap-2">
            {buying ? <span className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin"></span> : success ? 'Redirecting...' : `Pay Securely to Unlock`}
          </button>
          
          <p className="text-center text-[10px] text-gray-500 mt-4 uppercase tracking-widest font-mono">🔒 256-bit Encrypted Checkout</p>
        </div>
      </main>
    </div>
  )
}