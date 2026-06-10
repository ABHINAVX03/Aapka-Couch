'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function PlansPage() {
  const router = useRouter()
  const [plans, setPlans] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchPlans() }, [])

  const fetchPlans = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/meal-plans')
      if (!res.ok) { router.push('/login'); return }
      const { plans } = await res.json()
      setPlans(plans || [])
    } catch {
      // ignore
    } finally { setLoading(false) }
  }

  const downloadPlan = (plan: any) => {
    const blob = new Blob([JSON.stringify(plan.plan_json || plan, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `plan-${new Date(plan.generated_at).toISOString()}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  if (loading) return (
    <div className="min-h-screen bg-[#0c0c10] text-white flex items-center justify-center">Loading plans...</div>
  )

  return (
    <div className="min-h-screen bg-[#0c0c10] text-white">
      <header className="flex items-center justify-between px-4 md:px-6 py-4 border-b border-[#222230]">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/dashboard')} className="text-sm text-gray-400 hover:text-yellow-500">← Dashboard</button>
          <span className="text-gray-600">/</span>
          <h1 className="text-lg font-extrabold">All <span className="text-yellow-500">Plans</span></h1>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchPlans} className="px-3 py-2 bg-[#17171f] border border-[#222230] rounded-xl">Refresh</button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 md:px-6 py-6">
        {plans.length === 0 ? (
          <div className="bg-[#17171f] border border-dashed border-[#222230] rounded-2xl p-12 text-center">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-gray-400">No plans available.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {plans.map(plan => (
              <div key={plan.id} className="bg-[#17171f] border border-[#222230] rounded-2xl p-4 flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold">{new Date(plan.generated_at).toLocaleString()}</p>
                  <p className="text-xs text-gray-400 mt-1">{plan.plan_json?.daily_macros?.calories ?? '?'} kcal · {plan.plan_json?.daily_macros?.protein_g ?? '?'}g P</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => router.push('/dashboard')} className="px-3 py-2 bg-yellow-500 text-black rounded-md">View</button>
                  <button onClick={() => downloadPlan(plan)} className="px-3 py-2 bg-[#0c0c10] border border-[#222230] rounded-md">Download JSON</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
