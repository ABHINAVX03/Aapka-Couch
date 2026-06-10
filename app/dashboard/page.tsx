'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'

// -------------------- Types --------------------
interface FoodLog { plan_date: string; meal_index: number; meal_name: string; eaten: boolean }

// -------------------- Meal Card --------------------
function MealCard({
  meal, mealIndex, today, todayLogs, onToggle,
}: {
  meal: any; mealIndex: number; today: string; todayLogs: FoodLog[]; onToggle: (idx: number, name: string, eaten: boolean) => void
}) {
  const log = todayLogs.find(l => l.meal_index === mealIndex)
  const eaten = log?.eaten ?? false

  return (
    <div className={`border rounded-2xl p-5 mb-4 transition-all shadow-md ${
      eaten ? 'bg-green-500/5 border-green-500/20' : 'bg-[#17171f] border-[#222230] hover:border-yellow-500/30'
    }`}>
      <div className="flex justify-between items-start mb-4">
        <div className="flex-1">
          <span className="text-xs text-[#6b6b7e] uppercase tracking-[2px] font-mono bg-[#222230] px-2.5 py-1 rounded">
            {meal.time}
          </span>
          <h3 className={`text-xl font-bold mt-2 ${eaten ? 'text-green-400' : 'text-white'}`}>{meal.name}</h3>
        </div>
        <div className="flex items-center gap-3 ml-4">
          <div className="text-right">
            <span className="text-3xl font-extrabold text-yellow-500">{meal.kcal}</span>
            <span className="text-sm text-gray-500"> kcal</span>
            <p className="text-xs text-green-400 font-mono mt-1">{meal.protein_g}g protein</p>
          </div>
          {/* Eaten toggle */}
          <button
            onClick={() => onToggle(mealIndex, meal.name, !eaten)}
            title={eaten ? 'Mark as not eaten' : 'Mark as eaten'}
            className={`w-10 h-10 rounded-full border-2 flex items-center justify-center text-lg transition-all flex-shrink-0 ${
              eaten
                ? 'bg-green-500/20 border-green-500 text-green-400 scale-105'
                : 'border-[#333] text-gray-600 hover:border-green-500 hover:text-green-400'
            }`}
          >
            {eaten ? '✓' : '○'}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {meal.foods?.map((food: any, j: number) => (
          <div key={j} className="flex justify-between py-2.5 border-t border-[#222230]/75 text-sm items-center">
            <span className="text-gray-200">
              {food.name}{' '}
              {food.quantity && <span className="text-gray-500 text-xs ml-1">({food.quantity})</span>}
              <span className="inline-flex gap-1.5 ml-3">
                {food.protein_g != null && <span className="text-[9px] font-mono bg-green-400/10 text-green-400 px-1.5 py-0.5 rounded">P {food.protein_g}g</span>}
                {food.carbs_g != null && <span className="text-[9px] font-mono bg-blue-400/10 text-blue-400 px-1.5 py-0.5 rounded">C {food.carbs_g}g</span>}
                {food.fat_g != null && <span className="text-[9px] font-mono bg-yellow-500/10 text-yellow-400 px-1.5 py-0.5 rounded">F {food.fat_g}g</span>}
              </span>
            </span>
            <span className="text-gray-400 font-mono text-xs">{food.cost_inr != null ? `₹${food.cost_inr}` : ''}</span>
          </div>
        ))}
      </div>

      {meal.tip && (
        <div className="mt-4 text-xs text-gray-300 bg-[#1a1a24] border-l-2 border-yellow-500 pl-3 py-2.5 rounded-r-md">
          💡 <strong className="text-gray-400 font-normal">{meal.tip}</strong>
        </div>
      )}
    </div>
  )
}

// -------------------- Adherence Ring --------------------
function AdherenceRing({ eaten, total, streak }: { eaten: number; total: number; streak: number }) {
  const pct = total > 0 ? Math.round((eaten / total) * 100) : 0
  const r = 28
  const circ = 2 * Math.PI * r
  const offset = circ - (pct / 100) * circ
  return (
    <div className="flex items-center gap-3 bg-[#17171f] border border-[#222230] rounded-xl px-4 py-2.5">
      <div className="relative w-14 h-14">
        <svg className="w-14 h-14 -rotate-90" viewBox="0 0 70 70">
          <circle cx="35" cy="35" r={r} stroke="#222230" strokeWidth="6" fill="none" />
          <circle
            cx="35" cy="35" r={r}
            stroke={pct === 100 ? '#3dd68c' : pct >= 50 ? '#f4a623' : '#60a5fa'}
            strokeWidth="6" fill="none"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.5s ease' }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-xs font-extrabold font-mono text-white">{pct}%</span>
      </div>
      <div>
        <p className="text-xs text-gray-500 font-mono uppercase tracking-wider">Today's Adherence</p>
        <p className="text-sm font-bold text-white">{eaten}/{total} meals eaten</p>
        {streak > 0 && (
          <p className="text-xs text-orange-400 font-mono mt-0.5">🔥 {streak} day streak</p>
        )}
      </div>
    </div>
  )
}

// -------------------- Macro Progress Rings --------------------
function MacroRing({ label, consumed, target, color, unit = 'g' }: {
  label: string; consumed: number; target: number; color: string; unit?: string
}) {
  const pct = target > 0 ? Math.min(100, Math.round((consumed / target) * 100)) : 0
  const r = 32
  const circ = 2 * Math.PI * r
  const offset = circ - (pct / 100) * circ
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-20 h-20">
        <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r={r} stroke="#222230" strokeWidth="7" fill="none" />
          <circle cx="40" cy="40" r={r} stroke={color} strokeWidth="7" fill="none"
            strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.7s cubic-bezier(0.4,0,0.2,1)' }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-sm font-extrabold text-white font-mono">{pct}%</span>
        </div>
      </div>
      <div className="text-center">
        <p className="text-xs font-bold font-mono" style={{ color }}>{consumed}{unit}</p>
        <p className="text-[10px] text-gray-500 uppercase tracking-wider font-mono">{label}</p>
        <p className="text-[9px] text-gray-600 font-mono">/ {target}{unit}</p>
      </div>
    </div>
  )
}

function MacroRings({ plan, todayLogs }: { plan: any; todayLogs: FoodLog[] }) {
  const todayDayName = new Date().toLocaleDateString('en-US', { weekday: 'long' })
  const days = plan?.weekly_meals || []
  const todayDay = days.find((d: any) => d.day?.toLowerCase() === todayDayName.toLowerCase())
  const meals = todayDay?.meals || []

  // Sum macros from eaten meals only
  let consumedP = 0, consumedC = 0, consumedF = 0
  meals.forEach((meal: any, i: number) => {
    const log = todayLogs.find(l => l.meal_index === i)
    if (log?.eaten) {
      meal.foods?.forEach((food: any) => {
        consumedP += food.protein_g || 0
        consumedC += food.carbs_g || 0
        consumedF += food.fat_g || 0
      })
    }
  })

  const targets = plan?.daily_macros || {}

  return (
    <div className="bg-[#17171f] border border-[#222230] rounded-2xl p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-widest font-mono">Today's Macro Progress</p>
          <p className="text-sm text-gray-400 mt-0.5">Tap ✓ on meals above to update</p>
        </div>
        <span className="text-xs text-gray-600 font-mono">{new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
      </div>
      <div className="flex justify-around">
        <MacroRing label="Protein" consumed={Math.round(consumedP)} target={targets.protein_g || 0} color="#3dd68c" />
        <MacroRing label="Carbs" consumed={Math.round(consumedC)} target={targets.carbs_g || 0} color="#60a5fa" />
        <MacroRing label="Fat" consumed={Math.round(consumedF)} target={targets.fat_g || 0} color="#f4a623" />
      </div>
    </div>
  )
}

// -------------------- Generating Screen --------------------
const STEPS = [
  { icon: '⚖️', label: 'Reading your body metrics…' },
  { icon: '🔥', label: 'Calculating BMR & TDEE via Mifflin-St Jeor…' },
  { icon: '🥩', label: 'Setting protein at 2.0 g / kg body weight…' },
  { icon: '🧮', label: 'Splitting macros — carbs & fats…' },
  { icon: '🍱', label: 'Building 7-day Indian meal rotation…' },
  { icon: '🏋️', label: 'Designing your workout split…' },
  { icon: '🌙', label: 'Adding lifestyle & sleep protocols…' },
  { icon: '✅', label: 'Finalising your personalised plan…' },
]

function GeneratingScreen() {
  const [stepIdx, setStepIdx] = useState(0)
  useEffect(() => {
    const iv = setInterval(() => setStepIdx(p => (p < STEPS.length - 1 ? p + 1 : p)), 2800)
    return () => clearInterval(iv)
  }, [])
  return (
    <div className="min-h-screen bg-[#0c0c10] text-white flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="text-5xl mb-4 animate-pulse">🧠</div>
          <h1 className="text-2xl font-extrabold tracking-tight">Aapka<span className="text-yellow-500">Coach</span> AI</h1>
          <p className="text-gray-400 text-sm mt-2">Generating your personalised plan with DeepSeek AI…</p>
        </div>
        <div className="space-y-3 mb-10">
          {STEPS.map((step, i) => {
            const done = i < stepIdx; const active = i === stepIdx
            return (
              <div key={i} className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-500 ${
                done ? 'border-green-500/30 bg-green-500/5 opacity-60'
                  : active ? 'border-yellow-500/50 bg-yellow-500/5 scale-[1.02] shadow-lg shadow-yellow-500/10'
                  : 'border-[#222230] opacity-30'
              }`}>
                <span className="text-xl w-7 text-center">{done ? '✅' : step.icon}</span>
                <span className={`text-sm font-mono ${active ? 'text-yellow-400' : done ? 'text-green-400' : 'text-gray-500'}`}>{step.label}</span>
                {active && (
                  <span className="ml-auto flex gap-1">
                    {[0,1,2].map(d => <span key={d} className="w-1.5 h-1.5 bg-yellow-500 rounded-full animate-bounce" style={{ animationDelay: `${d * 0.15}s` }} />)}
                  </span>
                )}
              </div>
            )
          })}
        </div>
        <div className="w-full bg-[#17171f] rounded-full h-1.5 border border-[#222230]">
          <div className="bg-gradient-to-r from-yellow-500 to-orange-400 h-full rounded-full transition-all duration-700" style={{ width: `${Math.round(((stepIdx + 1) / STEPS.length) * 100)}%` }} />
        </div>
        <p className="text-center text-xs text-gray-500 font-mono mt-3">This takes 15–40 seconds. Please don't close this tab.</p>
      </div>
    </div>
  )
}

// -------------------- Main Dashboard --------------------
export default function DashboardPage() {
  const router = useRouter()
  const today = new Date().toISOString().split('T')[0]
  const todayDayName = new Date().toLocaleDateString('en-US', { weekday: 'long' })

  const [plan, setPlan] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [planFeedback, setPlanFeedback] = useState('')
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [buying, setBuying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [userName, setUserName] = useState('Athlete')

  const planWeek = plan?.plan_week ?? 1
  const planStartDate = plan?.generated_at ? new Date(plan.generated_at) : null
  const planDayIndex = planStartDate ? Math.min(7, Math.max(1, Math.floor((Date.now() - planStartDate.getTime()) / (24 * 60 * 60 * 1000)) + 1)) : 1
  const daysLeft = planStartDate ? Math.max(0, 7 - (planDayIndex - 1)) : 7
  const nextWeek = planWeek + 1
  const hasSubscriptionForNextWeek = profile?.paid_weeks >= nextWeek
  const isFirstWeek = planWeek === 1

  // Food log state
  const [todayLogs, setTodayLogs] = useState<FoodLog[]>([])
  const [streak, setStreak] = useState(0)

  useEffect(() => { loadPlan() }, [])
  useEffect(() => { if (plan) loadFoodLog() }, [plan])

  const loadPlan = async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/me')
      if (!res.ok) { router.push('/login'); return }
      const { user } = await res.json()
      setUserName(user?.profile?.name || user?.email || 'Athlete')
      setProfile(user?.profile || null)

      const planRes = await fetch('/api/meal-plan')
      if (planRes.ok) {
        const data = await planRes.json()
        setPlan(data.plan || null)
      } else { setPlan(null) }
    } catch { setError('Failed to load your plan') }
    finally { setLoading(false) }
  }

  const loadFoodLog = useCallback(async () => {
    try {
      const res = await fetch(`/api/food-log?date=${today}`)
      if (res.ok) {
        const data = await res.json()
        setTodayLogs(data.logs || [])
        setStreak(data.streak || 0)
      }
    } catch { /* silent */ }
  }, [today])

  const toggleMealEaten = async (mealIndex: number, mealName: string, eaten: boolean) => {
    // Optimistic update
    setTodayLogs(prev => {
      const existing = prev.find(l => l.meal_index === mealIndex)
      if (existing) return prev.map(l => l.meal_index === mealIndex ? { ...l, eaten } : l)
      return [...prev, { plan_date: today, meal_index: mealIndex, meal_name: mealName, eaten }]
    })
    try {
      await fetch('/api/food-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_date: today, meal_index: mealIndex, meal_name: mealName, eaten }),
      })
      // Refresh streak
      const res = await fetch(`/api/food-log?date=${today}`)
      if (res.ok) { const d = await res.json(); setStreak(d.streak || 0) }
    } catch { /* silent */ }
  }

  const generateNextWeek = async () => {
    setGenerating(true); setError(null)
    try {
      const res = await fetch('/api/generate-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: planFeedback.trim() }),
      })

      const data = await res.json().catch(() => null)
      if (!res.ok || !data) {
        setError(data?.error || 'Failed to generate next week')
      } else if (data.success) {
        setPlan(data.plan)
        setPlanFeedback('')
      } else {
        setError(data.error || 'Failed to generate next week')
      }
    } catch {
      setError('Failed to generate next week')
    } finally {
      setGenerating(false)
    }
  }

  const buyNextWeek = async () => {
    setBuying(true); setError(null)
    try {
      const res = await fetch('/api/subscription', { method: 'POST' })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error || 'Failed to buy subscription week')
      } else {
        await loadPlan()
      }
    } catch {
      setError('Failed to purchase week')
    } finally {
      setBuying(false)
    }
  }

  const triggerRegeneration = async () => {
    if (generating) return
    await generateNextWeek()
  }

  const handleLogout = async () => {
    try { await fetch('/api/logout', { method: 'POST' }) } catch {}
    router.push('/login')
  }

  // ---------- RENDER HELPERS ----------



  // ---------- MAIN STATES ----------
  if (loading) return <div className="min-h-screen bg-[#0c0c10] text-white flex items-center justify-center font-mono">Loading AapkaCoach profile...</div>
  if (error) return (
    <div className="min-h-screen bg-[#0c0c10] text-white flex items-center justify-center p-4">
      <div className="bg-[#17171f] border border-red-500/20 p-6 rounded-2xl text-center max-w-sm">
        <p className="text-red-400 mb-4 font-mono">{error}</p>
        <button onClick={loadPlan} className="px-5 py-2 bg-yellow-500 text-black font-bold rounded-lg hover:bg-yellow-600">Retry</button>
      </div>
    </div>
  )
  if (generating) return <GeneratingScreen />

  return (
    <div className="min-h-screen bg-[#0c0c10] text-white">
      {/* Header */}
      <header className="flex items-center justify-between px-4 md:px-6 py-4 border-b border-[#222230]">
        <h1 className="text-2xl font-extrabold tracking-tight cursor-pointer" onClick={() => router.push('/dashboard')}>
          Aapka<span className="text-yellow-500">Coach</span>
        </h1>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button onClick={() => router.push('/dashboard/plans')}
            className="text-xs bg-[#17171f] hover:bg-yellow-500/10 border border-[#222230] text-gray-300 px-3 py-2 rounded-full transition-colors">
            📥 All Plans
          </button>
          <button onClick={() => router.push('/dashboard/subscriptions')}
            className="text-xs bg-[#17171f] hover:bg-yellow-500/10 border border-[#222230] text-gray-300 px-3 py-2 rounded-full transition-colors">
            💳 Subscribe
          </button>
          <button onClick={() => router.push('/dashboard/progress')}
            className="text-xs bg-[#17171f] hover:bg-yellow-500/10 border border-[#222230] text-gray-300 px-3 py-2 rounded-full transition-colors">
            📊 Progress
          </button>
          <button onClick={() => router.push('/dashboard/history')}
            className="text-xs bg-[#17171f] hover:bg-yellow-500/10 border border-[#222230] text-gray-300 px-3 py-2 rounded-full transition-colors">
            📋 History
          </button>
          <button onClick={() => router.push('/dashboard/profile')}
            className="text-xs bg-[#17171f] hover:bg-yellow-500/10 border border-[#222230] text-gray-300 px-3 py-2 rounded-full transition-colors">
            👤 Profile
          </button>
          <span className="text-xs text-gray-400 font-mono hidden md:inline bg-[#17171f] px-3 py-2 rounded-full border border-[#222230]">{userName}</span>
          <button onClick={handleLogout}
            className="text-xs bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 px-3 py-2 rounded-full transition-colors">
            Logout
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-4xl mx-auto px-4 md:px-6 pt-6">
        {!plan ? (
          <div className="bg-[#17171f] border border-[#222230] rounded-2xl p-8 text-center my-8 max-w-xl mx-auto shadow-xl">
            <div className="text-5xl mb-4">📋</div>
            <h2 className="text-2xl font-bold mb-3 text-white">No Active Plan Found</h2>
            <p className="text-gray-400 text-sm mb-6 leading-relaxed">
              We'll calculate your custom calorie targets, design your workout splits, and arrange meals matching your budget and dietary preferences.
            </p>
            <button onClick={triggerRegeneration}
              className="px-6 py-3 bg-yellow-500 text-black font-extrabold rounded-lg hover:bg-yellow-600 transition-colors shadow-lg shadow-yellow-500/20">
              Generate My AI Plan 🤖
            </button>
          </div>
        ) : (
          <div>
            {/* Calorie target bar */}
            <div className="bg-[#17171f] border border-[#222230] rounded-2xl p-4 mb-4 flex flex-col gap-4">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider font-mono">Daily Target</p>
                  <p className="text-2xl font-extrabold text-white mt-0.5">
                    {plan.daily_macros?.calories} <span className="text-sm font-normal text-gray-400">kcal</span>
                  </p>
                </div>
                <div className="text-right text-xs font-mono text-gray-500">
                  <p>{plan.daily_macros?.protein_g}g protein</p>
                  <p>{plan.daily_macros?.carbs_g}g carbs · {plan.daily_macros?.fat_g}g fat</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-[#0f0f15] rounded-2xl p-4 border border-[#222230]">
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-mono">Plan Week</p>
                  <p className="text-lg font-bold text-white mt-1">Week {planWeek}</p>
                </div>
                <div className="bg-[#0f0f15] rounded-2xl p-4 border border-[#222230]">
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-mono">Day Progress</p>
                  <p className="text-lg font-bold text-white mt-1">Day {planDayIndex} of 7</p>
                </div>
                <div className="bg-[#0f0f15] rounded-2xl p-4 border border-[#222230]">
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-mono">Days Left</p>
                  <p className="text-lg font-bold text-white mt-1">{daysLeft} days</p>
                </div>
              </div>
              <div className="bg-[#0a0a10] rounded-2xl border border-[#222230] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-white">Subscription: <span className="text-yellow-400 font-mono">{profile?.paid_weeks ?? 1}/{profile?.paid_weeks ?? 1}</span> weeks</p>
                  <button onClick={() => router.push('/dashboard/subscriptions')} className="text-xs px-2 py-1 bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 rounded hover:bg-yellow-500/20">Manage</button>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">7 / 7 days left</span>
                  <span className="text-xs text-gray-500 font-mono">Week resets in 7d</span>
                </div>
                <div className="w-full bg-[#1a1a24] rounded-full h-2 overflow-hidden">
                  <div className="bg-gradient-to-r from-green-500 to-yellow-500 h-full" style={{ width: '100%' }}></div>
                </div>
                {!hasSubscriptionForNextWeek && (
                  <p className="text-yellow-300 text-xs mt-2">🔒 Buy week {nextWeek} to unlock continuous improvement</p>
                )}
                {hasSubscriptionForNextWeek && profile?.paid_weeks > planWeek && (
                  <p className="text-green-300 text-xs mt-2">✓ Week {nextWeek} unlocked. Generate when ready.</p>
                )}
              </div>
            </div>

            {/* Macro Progress Rings */}
            <MacroRings plan={plan} todayLogs={todayLogs} />



            {/* Tab Navigation */}
            <button
              onClick={() => router.push('/dashboard/week')}
              className="w-full py-4 bg-gradient-to-r from-yellow-500 to-yellow-400 text-black font-bold rounded-2xl hover:from-yellow-400 hover:to-yellow-300 transition-all shadow-lg"
            >
              View Full Week Plan → (Diet · Workout · Lifestyle)
            </button>
          </div>
        )}
      </main>
    </div>
  )
}