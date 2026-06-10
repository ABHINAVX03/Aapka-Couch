'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

interface PlanSummary {
  id: string
  generated_at: string
  plan_json: {
    daily_macros?: { calories: number; protein_g: number; carbs_g: number; fat_g: number }
    weekly_meals?: any[]
    workout_plan?: { split: string; days_per_week: number }
  }
}

export default function HistoryPage() {
  const router = useRouter()
  const [plans, setPlans] = useState<PlanSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [activePlan, setActivePlan] = useState<string | null>(null)
  const [restoring, setRestoring] = useState(false)

  useEffect(() => { fetchPlans() }, [])

  const fetchPlans = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/meal-plans')
      if (!res.ok) { router.push('/login'); return }
      const { plans } = await res.json()
      setPlans(plans || [])
      if (plans?.length > 0) setActivePlan(plans[0].id)
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }

  const restorePlan = async (planId: string) => {
    // The "latest" plan is always what the dashboard shows.
    // To restore an old plan, we just navigate to dashboard (user can see any day).
    setActivePlan(planId)
    router.push('/dashboard')
  }

  if (loading) return (
    <div className="min-h-screen bg-[#0c0c10] text-white flex items-center justify-center font-mono">
      Loading plan history...
    </div>
  )

  const selected = plans.find(p => p.id === activePlan)

  return (
    <div className="min-h-screen bg-[#0c0c10] text-white">
      {/* Header */}
      <header className="flex items-center justify-between px-4 md:px-6 py-4 border-b border-[#222230]">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/dashboard')} className="text-sm text-gray-400 hover:text-yellow-500 transition-colors">
            ← Dashboard
          </button>
          <span className="text-gray-600">/</span>
          <h1 className="text-lg font-extrabold">Plan<span className="text-yellow-500"> History</span></h1>
        </div>
        <span className="text-xs text-gray-500 font-mono">{plans.length} plan{plans.length !== 1 ? 's' : ''} generated</span>
      </header>

      <main className="max-w-4xl mx-auto px-4 md:px-6 py-6">
        {plans.length === 0 ? (
          <div className="bg-[#17171f] border border-dashed border-[#222230] rounded-2xl p-12 text-center">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-gray-400">No plans generated yet. Go to your dashboard to generate your first plan.</p>
            <button onClick={() => router.push('/dashboard')} className="mt-4 px-5 py-2 bg-yellow-500 text-black font-bold rounded-lg hover:bg-yellow-400 transition-colors text-sm">
              Go to Dashboard
            </button>
          </div>
        ) : (
          <div className="grid md:grid-cols-3 gap-6">
            {/* Plan list sidebar */}
            <div className="space-y-2">
              <p className="text-xs text-gray-500 uppercase tracking-widest font-mono mb-3">Generated Plans</p>
              {plans.map((plan, i) => {
                const date = new Date(plan.generated_at)
                const isActive = plan.id === activePlan
                return (
                  <button
                    key={plan.id}
                    onClick={() => setActivePlan(plan.id)}
                    className={`w-full text-left p-4 rounded-xl border transition-all ${
                      isActive
                        ? 'border-yellow-500/50 bg-yellow-500/5'
                        : 'border-[#222230] bg-[#17171f] hover:border-yellow-500/20'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-semibold text-white">
                          {date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                        <p className="text-xs text-gray-500 font-mono mt-0.5">
                          {date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      {i === 0 && (
                        <span className="text-[10px] bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded font-bold font-mono">LATEST</span>
                      )}
                    </div>
                    <div className="mt-2 flex gap-2 text-xs font-mono text-gray-400">
                      <span>{plan.plan_json?.daily_macros?.calories ?? '?'} kcal</span>
                      <span>·</span>
                      <span>{plan.plan_json?.daily_macros?.protein_g ?? '?'}g P</span>
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Plan detail */}
            {selected && (
              <div className="md:col-span-2 space-y-4">
                <div className="bg-[#17171f] border border-[#222230] rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-bold text-white">Plan Details</h2>
                    <span className="text-xs text-gray-500 font-mono">
                      {new Date(selected.generated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </span>
                  </div>

                  {/* Macros */}
                  {selected.plan_json?.daily_macros && (
                    <div className="grid grid-cols-4 gap-3 mb-5">
                      {[
                        { label: 'Calories', value: selected.plan_json.daily_macros.calories, unit: 'kcal', color: 'text-yellow-400' },
                        { label: 'Protein', value: selected.plan_json.daily_macros.protein_g, unit: 'g', color: 'text-green-400' },
                        { label: 'Carbs', value: selected.plan_json.daily_macros.carbs_g, unit: 'g', color: 'text-blue-400' },
                        { label: 'Fat', value: selected.plan_json.daily_macros.fat_g, unit: 'g', color: 'text-orange-400' },
                      ].map(m => (
                        <div key={m.label} className="bg-[#0c0c10] rounded-xl p-3 text-center border border-[#222230]">
                          <p className={`text-xl font-extrabold ${m.color}`}>{m.value}</p>
                          <p className="text-[10px] text-gray-500 font-mono">{m.unit}</p>
                          <p className="text-[10px] text-gray-600 uppercase tracking-wider">{m.label}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Workout info */}
                  {selected.plan_json?.workout_plan && (
                    <div className="bg-[#0c0c10] border border-[#222230] rounded-xl p-4 mb-4">
                      <p className="text-xs text-gray-500 uppercase tracking-wider font-mono mb-2">Workout Split</p>
                      <p className="text-white font-semibold">{selected.plan_json.workout_plan.split}</p>
                      <p className="text-sm text-gray-400 mt-1">{selected.plan_json.workout_plan.days_per_week} days / week</p>
                    </div>
                  )}

                  {/* Meal day preview */}
                  {selected.plan_json?.weekly_meals?.[0] && (
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wider font-mono mb-3">Day 1 Meals Preview</p>
                      <div className="space-y-2">
                        {selected.plan_json.weekly_meals[0].meals?.slice(0, 3).map((meal: any, i: number) => (
                          <div key={i} className="flex justify-between items-center py-2 border-b border-[#222230]/50 text-sm">
                            <div>
                              <span className="text-gray-200">{meal.name}</span>
                              <span className="text-gray-500 text-xs ml-2 font-mono">{meal.time}</span>
                            </div>
                            <span className="text-yellow-500 font-mono text-xs">{meal.kcal} kcal</span>
                          </div>
                        ))}
                        {(selected.plan_json.weekly_meals[0].meals?.length ?? 0) > 3 && (
                          <p className="text-xs text-gray-500 text-center pt-1">
                            + {selected.plan_json.weekly_meals[0].meals.length - 3} more meals…
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Action to go to dashboard with this plan */}
                <button
                  onClick={() => router.push('/dashboard')}
                  className="w-full py-3 bg-yellow-500 text-black font-extrabold rounded-xl hover:bg-yellow-400 transition-colors"
                >
                  View Full Plan on Dashboard →
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
