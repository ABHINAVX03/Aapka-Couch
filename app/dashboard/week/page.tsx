'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

// ── Types & Helper Components (same as dashboard) ──
interface FoodLog { plan_date: string; meal_index: number; meal_name: string; eaten: boolean }

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
          <span className="text-xs text-[#6b6b7e] uppercase tracking-[2px] font-mono bg-[#222230] px-2.5 py-1 rounded">{meal.time}</span>
          <h3 className={`text-xl font-bold mt-2 ${eaten ? 'text-green-400' : 'text-white'}`}>{meal.name}</h3>
        </div>
        <div className="flex items-center gap-3 ml-4">
          <div className="text-right">
            <span className="text-3xl font-extrabold text-yellow-500">{meal.kcal}</span>
            <span className="text-sm text-gray-500"> kcal</span>
            <p className="text-xs text-green-400 font-mono mt-1">{meal.protein_g}g protein</p>
          </div>
          <button onClick={() => onToggle(mealIndex, meal.name, !eaten)} title={eaten ? 'Mark as not eaten' : 'Mark as eaten'}
            className={`w-10 h-10 rounded-full border-2 flex items-center justify-center text-lg transition-all flex-shrink-0 ${
              eaten ? 'bg-green-500/20 border-green-500 text-green-400 scale-105' : 'border-[#333] text-gray-600 hover:border-green-500 hover:text-green-400'
            }`}>
            {eaten ? '✓' : '○'}
          </button>
        </div>
      </div>
      <div className="space-y-2">
        {meal.foods?.map((food: any, j: number) => (
          <div key={j} className="flex justify-between py-2.5 border-t border-[#222230]/75 text-sm items-center">
            <span className="text-gray-200">
              {food.name} {food.quantity && <span className="text-gray-500 text-xs ml-1">({food.quantity})</span>}
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

export default function WeekPlanPage() {
  const router = useRouter()
  const [plan, setPlan] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [activeDay, setActiveDay] = useState(0)
  const [activeTab, setActiveTab] = useState<'meals' | 'workouts' | 'lifestyle'>('meals')
  const [todayLogs, setTodayLogs] = useState<FoodLog[]>([])
  const today = new Date().toISOString().split('T')[0]
  const todayDayName = new Date().toLocaleDateString('en-US', { weekday: 'long' })

  // Auto‑select today's day once plan is loaded
  useEffect(() => {
    if (plan && plan.weekly_meals) {
      const todayIndex = plan.weekly_meals.findIndex(
        (day: any) => day.day?.toLowerCase() === todayDayName.toLowerCase()
      )
      if (todayIndex !== -1) {
        setActiveDay(todayIndex)
      } else {
        setActiveDay(0) // fallback
      }
    }
  }, [plan, todayDayName])

  useEffect(() => {
    fetchPlan()
    fetchTodayLogs()
  }, [])

  const fetchPlan = async () => {
    try {
      const res = await fetch('/api/meal-plan')
      if (!res.ok) return
      const data = await res.json()
      setPlan(data.plan || null)
    } catch { /* ignore */ } finally { setLoading(false) }
  }

  const fetchTodayLogs = async () => {
    try {
      const res = await fetch(`/api/food-log?date=${today}`)
      if (res.ok) setTodayLogs((await res.json()).logs || [])
    } catch { /* ignore */ }
  }

  const toggleMealEaten = async (mealIndex: number, mealName: string, eaten: boolean) => {
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
    } catch { /* ignore */ }
  }

  if (loading) return <div className="min-h-screen bg-[#0c0c10] text-white flex items-center justify-center">Loading plan...</div>
  if (!plan) return (
    <div className="min-h-screen bg-[#0c0c10] text-white flex items-center justify-center">
      <div className="text-center"><p className="text-gray-400 mb-4">No plan found</p>
        <button onClick={() => router.push('/dashboard')} className="px-4 py-2 bg-yellow-500 text-black rounded-lg">← Back to Dashboard</button>
      </div>
    </div>
  )

  const days = plan.weekly_meals || []
  const currentDay = days[activeDay] || {}
  const meals = currentDay.meals || []

  const renderMealsContent = () => (
    <div>
      <div className="mb-4 flex overflow-x-auto gap-2 pb-2">
        {days.map((day: any, idx: number) => {
          const isDayToday = day.day?.toLowerCase() === todayDayName.toLowerCase()
          return (
            <button key={idx} onClick={() => setActiveDay(idx)}
              className={`px-4 py-2 rounded-full font-semibold text-sm whitespace-nowrap transition-all relative ${
                idx === activeDay ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/20' : 'bg-[#17171f] text-gray-400 border border-[#222230] hover:border-yellow-500'
              }`}>
              {day.day}
              {isDayToday && <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-400 rounded-full border border-[#0c0c10]" />}
            </button>
          )
        })}
      </div>
      <div className="pb-8 space-y-4">
        {meals.length > 0 ? meals.map((meal: any, i: number) => (
          <MealCard key={i} meal={meal} mealIndex={i} today={today} todayLogs={todayLogs} onToggle={toggleMealEaten} />
        )) : <p className="text-gray-400 text-center py-8 border border-dashed border-[#222230] rounded-2xl">No meals planned for this day.</p>}
      </div>
    </div>
  )

  const renderWorkoutsContent = () => {
    const workout = plan.workout_plan || {}
    const sessions = workout.sessions || []
    return (
      <div className="space-y-6 pb-8">
        <div className="bg-[#17171f] border border-[#222230] rounded-2xl p-5">
          <h2 className="text-lg font-bold text-yellow-500 mb-2 font-mono uppercase tracking-wide">Split Overview</h2>
          <p className="text-sm text-gray-300 leading-relaxed">
            <strong>Training Schedule:</strong> {workout.split || 'Custom Split'} <br />
            <strong>Frequency:</strong> {workout.days_per_week || 4} days / week <br />
            <strong>Cardio Target:</strong> {workout.cardio || 'Not specified'}
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          {sessions.map((session: any, idx: number) => (
            <div key={idx} className="bg-[#17171f] border border-[#222230] rounded-2xl p-5 hover:border-yellow-500/25 transition-all">
              <h3 className="text-lg font-bold text-white mb-4 border-b border-[#222230] pb-2 font-mono">{session.name}</h3>
              <div className="space-y-4">
                {session.exercises?.map((ex: any, i: number) => (
                  <div key={i} className="text-sm flex flex-col border-b border-[#222230]/50 pb-3 last:border-b-0 last:pb-0">
                    <div className="flex justify-between items-start">
                      <span className="font-semibold text-gray-200">{ex.name}</span>
                      <span className="text-yellow-500 font-mono text-xs bg-yellow-500/10 px-2 py-0.5 rounded whitespace-nowrap">{ex.sets}s × {ex.reps}r</span>
                    </div>
                    {ex.tip && <span className="text-xs text-gray-400 mt-1 italic">💡 {ex.tip}</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const renderLifestyleContent = () => {
    const rules = plan.lifestyle_rules || {}
    return (
      <div className="space-y-6 pb-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-[#17171f] border border-[#222230] rounded-2xl p-5 text-center">
            <p className="text-gray-400 text-xs uppercase tracking-wider mb-2 font-mono">Sleep Target</p>
            <p className="text-3xl font-extrabold text-blue-400">{rules.sleep_hours || 8} <span className="text-base font-normal">hrs</span></p>
          </div>
          <div className="bg-[#17171f] border border-[#222230] rounded-2xl p-5 text-center">
            <p className="text-gray-400 text-xs uppercase tracking-wider mb-2 font-mono">Daily Water</p>
            <p className="text-3xl font-extrabold text-cyan-400">{rules.water_litres || 3.5} <span className="text-base font-normal">L</span></p>
          </div>
          <div className="bg-[#17171f] border border-[#222230] rounded-2xl p-5 text-center">
            <p className="text-gray-400 text-xs uppercase tracking-wider mb-2 font-mono">Daily Steps</p>
            <p className="text-3xl font-extrabold text-green-400">{typeof rules.steps_daily === 'number' ? rules.steps_daily.toLocaleString() : (rules.steps_daily || '10,000')}</p>
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-[#17171f] border border-[#222230] rounded-2xl p-5">
            <h3 className="text-lg font-bold text-red-400 mb-3 font-mono border-b border-[#222230] pb-2">Foods to Avoid</h3>
            <ul className="list-disc pl-5 text-sm text-gray-300 space-y-2">
              {rules.avoid_list?.map((item: string, i: number) => <li key={i} className="leading-relaxed">{item}</li>) || <li>No specific avoid items.</li>}
            </ul>
          </div>
          <div className="bg-[#17171f] border border-[#222230] rounded-2xl p-5">
            <h3 className="text-lg font-bold text-yellow-500 mb-3 font-mono border-b border-[#222230] pb-2">Guidelines & Refeeds</h3>
            <div className="space-y-4">
              <div>
                <h4 className="text-xs text-gray-400 uppercase tracking-wider font-mono">Refeed Strategy</h4>
                <p className="text-sm text-gray-200 mt-1 leading-relaxed">{rules.refeed_day || 'Not specified.'}</p>
              </div>
              <div>
                <h4 className="text-xs text-gray-400 uppercase tracking-wider font-mono mb-2">Stress Management</h4>
                <ul className="list-disc pl-5 text-xs text-gray-300 space-y-1.5">
                  {rules.stress_tips?.map((tip: string, i: number) => <li key={i} className="leading-relaxed">{tip}</li>) || <li>Keep physical stressors low.</li>}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0c0c10] text-white">
      <header className="flex items-center justify-between px-4 md:px-6 py-4 border-b border-[#222230]">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/dashboard')} className="text-sm text-gray-400 hover:text-yellow-500">← Dashboard</button>
          <span className="text-gray-600">/</span>
          <h1 className="text-lg font-extrabold">Week Plan</h1>
        </div>
        {/* Optional: Plan creation date */}
        {plan?.generated_at && (
          <div className="text-xs text-gray-500 font-mono">
            📅{' '}
            {new Date(plan.generated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        )}
      </header>

      <main className="max-w-5xl mx-auto px-4 md:px-6 py-6">
        {/* Tab Navigation */}
        <div className="flex border-b border-[#222230] mb-6">
          {(['meals', 'workouts', 'lifestyle'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`flex-1 py-3.5 font-bold text-sm transition-all border-b-2 capitalize ${
                activeTab === tab ? 'border-yellow-500 text-yellow-500 bg-yellow-500/5' : 'border-transparent text-gray-400 hover:text-white'
              }`}>
              {tab === 'meals' ? '🍽️ Diet Plan' : tab === 'workouts' ? '💪 Workout Split' : '🌙 Lifestyle & Rules'}
            </button>
          ))}
        </div>

        {activeTab === 'meals' && renderMealsContent()}
        {activeTab === 'workouts' && renderWorkoutsContent()}
        {activeTab === 'lifestyle' && renderLifestyleContent()}
      </main>
    </div>
  )
}