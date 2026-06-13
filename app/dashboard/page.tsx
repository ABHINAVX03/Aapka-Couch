'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'

// -------------------- Types & Helpers --------------------
interface FoodLog { plan_date: string; meal_index: number; meal_name: string; eaten: boolean }

function getDayName(d: any): string {
  let name = String(d?.day_name || d?.day || '');
  const numMatch = name.match(/^Day\s*(\d+)$/i) || name.match(/^(\d+)$/);
  if (numMatch) {
    const dayNum = parseInt(numMatch[1]);
    if (dayNum >= 1 && dayNum <= 7) return ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][dayNum - 1];
  }
  return name;
}

function ensureArray(val: any): any[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  return [val];
}

function parseNum(val: any): number {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const match = String(val).match(/[\d.]+/);
  return match ? parseFloat(match[0]) : 0;
}

// -------------------- Indestructible Normalizers --------------------
function normalizeFood(raw: any) {
  if (!raw || typeof raw !== 'object') return { name: String(raw || 'Food item'), quantity: '1 serving', kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 };
  return {
    name: raw.name || raw.item || raw.food || raw.Name || 'Food item',
    quantity: raw.quantity || raw.amount || raw.qty || raw.Quantity || '1 serving',
    protein_g: parseNum(raw.protein_g ?? raw.protein ?? raw.Protein),
    carbs_g: parseNum(raw.carbs_g ?? raw.carbs ?? raw.Carbs),
    fat_g: parseNum(raw.fat_g ?? raw.fat ?? raw.Fat),
    fiber_g: parseNum(raw.fiber_g ?? raw.fiber ?? raw.Fiber),
    kcal: parseNum(raw.kcal ?? raw.calories ?? raw.Calories ?? raw.Kcal),
  };
}

function normalizeMeal(raw: any, index: number) {
  if (!raw || typeof raw !== 'object') return { time: `Meal ${index + 1}`, name: String(raw || `Meal ${index + 1}`), kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, foods: [], tip: '' };
  
  let foods = ensureArray(raw.foods ?? raw.ingredients ?? raw.items).map(normalizeFood);
  const name = raw.name || raw.Meal || raw.title || raw.Name || `Meal ${index + 1}`;
  const kcal = parseNum(raw.kcal ?? raw.calories) || foods.reduce((acc, f) => acc + f.kcal, 0);
  const protein_g = parseNum(raw.protein_g ?? raw.protein) || foods.reduce((acc, f) => acc + f.protein_g, 0);
  const carbs_g = parseNum(raw.carbs_g ?? raw.carbs) || foods.reduce((acc, f) => acc + f.carbs_g, 0);
  const fat_g = parseNum(raw.fat_g ?? raw.fat) || foods.reduce((acc, f) => acc + f.fat_g, 0);

  if (foods.length === 0) foods = [{ name, quantity: '1 serving', protein_g, carbs_g, fat_g, kcal, fiber_g: 0 }];
  return { time: raw.time || raw.Time || `Meal ${index + 1}`, name, kcal, protein_g, carbs_g, fat_g, foods, tip: raw.tip ?? raw.Tip ?? raw.note ?? '' };
}

// -------------------- Compact UI Components --------------------
function CompactMealCard({ meal, mealIndex, todayLogs, onToggle }: any) {
  const log = todayLogs.find((l: any) => l.meal_index === mealIndex)
  const eaten = log?.eaten ?? false

  return (
    <div className={`flex items-center justify-between p-4 border rounded-2xl mb-3 transition-all ${eaten ? 'bg-green-500/5 border-green-500/20' : 'bg-[#17171f] border-[#222230] hover:border-yellow-500/30'}`}>
      <div className="flex items-center gap-4 w-full">
        <button onClick={() => onToggle(mealIndex, meal.name, !eaten)} className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm transition-all flex-shrink-0 ${eaten ? 'bg-green-500/20 border-green-500 text-green-400' : 'border-[#333] text-gray-600 hover:border-green-500 hover:text-green-400'}`}>
          {eaten ? '✓' : ''}
        </button>
        <div className="flex-1">
          <p className={`text-sm font-bold ${eaten ? 'text-green-400' : 'text-white'}`}>{meal.name}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] bg-[#222230] text-gray-400 px-2 py-0.5 rounded font-mono">{meal.time}</span>
            <span className="text-xs text-gray-500 font-mono"><span className="text-yellow-500 font-bold">{meal.kcal}</span> kcal · {meal.protein_g}g P</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function AdherenceRing({ eaten, total, streak }: { eaten: number; total: number; streak: number }) {
  const pct = total > 0 ? Math.round((eaten / total) * 100) : 0
  const r = 28; const circ = 2 * Math.PI * r; const offset = circ - (pct / 100) * circ;
  return (
    <div className="flex items-center gap-4 bg-[#17171f] border border-[#222230] rounded-2xl px-5 py-4">
      <div className="relative w-14 h-14">
        <svg className="w-14 h-14 -rotate-90" viewBox="0 0 70 70">
          <circle cx="35" cy="35" r={r} stroke="#222230" strokeWidth="6" fill="none" />
          <circle cx="35" cy="35" r={r} stroke={pct === 100 ? '#3dd68c' : pct >= 50 ? '#f4a623' : '#60a5fa'} strokeWidth="6" fill="none" strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-xs font-extrabold font-mono text-white">{pct}%</span>
      </div>
      <div>
        <p className="text-xs text-gray-500 font-mono uppercase tracking-wider">Today's Adherence</p>
        <p className="text-sm font-bold text-white mt-0.5">{eaten} of {total} meals completed</p>
        {streak > 0 && <p className="text-xs text-orange-400 font-mono mt-1">🔥 {streak} day streak</p>}
      </div>
    </div>
  )
}

function MacroRing({ label, consumed, target, color }: { label: string; consumed: number; target: number; color: string }) {
  const pct = target > 0 ? Math.min(100, Math.round((consumed / target) * 100)) : 0
  const r = 24; const circ = 2 * Math.PI * r; const offset = circ - (pct / 100) * circ;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-16 h-16">
        <svg className="w-16 h-16 -rotate-90" viewBox="0 0 60 60">
          <circle cx="30" cy="30" r={r} stroke="#222230" strokeWidth="5" fill="none" />
          <circle cx="30" cy="30" r={r} stroke={color} strokeWidth="5" fill="none" strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.7s ease' }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center"><span className="text-[10px] font-extrabold text-white font-mono">{pct}%</span></div>
      </div>
      <div className="text-center">
        <p className="text-[11px] font-bold font-mono" style={{ color }}>{consumed}g</p>
        <p className="text-[9px] text-gray-500 uppercase tracking-wider font-mono mt-0.5">{label}</p>
      </div>
    </div>
  )
}

function MacroRings({ plan, todayLogs, todayDayName }: { plan: any; todayLogs: FoodLog[]; todayDayName: string }) {
  const days = ensureArray(plan?.weekly_meals)
  const todayDay = days.find((d: any) => getDayName(d).toLowerCase() === todayDayName.toLowerCase())
  const normalizedMeals = ensureArray(todayDay?.meals).map(normalizeMeal)

  let consumedP = 0, consumedC = 0, consumedF = 0
  normalizedMeals.forEach((meal, i) => {
    if (todayLogs.find(l => l.meal_index === i)?.eaten) {
      meal.foods.forEach((food) => { consumedP += food.protein_g || 0; consumedC += food.carbs_g || 0; consumedF += food.fat_g || 0; })
    }
  })

  const targets = plan?.daily_macros || {}
  return (
    <div className="bg-[#17171f] border border-[#222230] rounded-2xl p-5 mb-6 shadow-sm">
      <div className="flex items-center justify-between mb-4 border-b border-[#222230] pb-3">
        <p className="text-xs text-gray-400 uppercase tracking-widest font-mono">Macro Progress</p>
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

// -------------------- FULL SCREEN IMMERSIVE LOADING --------------------
function GeneratingScreen({ name, week }: { name: string; week: number }) {
  const [stepIdx, setStepIdx] = useState(0)
  const formattedName = name ? name.split(' ')[0] : 'your'

  const STEPS = [
    { icon: '⚖️', label: `Analyzing ${formattedName}'s weekly progress…` },
    { icon: '🔥', label: `Recalculating macros & targets for Week ${week}…` },
    { icon: '🥩', label: 'Setting exact food splits (Protein, Carbs, Fats)…' },
    { icon: '🍱', label: `Structuring 7-day intelligent meal plan…` },
    { icon: '🏋️', label: `Designing periodized workout split…` },
    { icon: '🌙', label: 'Adding lifestyle & sleep protocols…' },
    { icon: '🚀', label: 'Finalizing AapkaCoach Master Plan…' },
  ]

  useEffect(() => {
    const t = setInterval(() => setStepIdx(i => Math.min(i + 1, STEPS.length - 1)), 3500)
    return () => clearInterval(t)
  }, [STEPS.length])
  
  const s = STEPS[stepIdx]
  
  return (
    <div className="min-h-screen bg-[#0c0c10]/95 backdrop-blur-3xl text-white flex flex-col items-center justify-center gap-6 px-6 fixed inset-0 z-[100]">
      <div className="text-7xl animate-bounce drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">{s.icon}</div>
      <div className="text-center max-w-sm">
        <p className="text-2xl font-bold font-mono text-white leading-relaxed">{s.label}</p>
        <p className="text-sm text-yellow-500 mt-3 animate-pulse">DeepSeek AI is working. Do not close this tab.</p>
      </div>
      
      <div className="w-full max-w-sm space-y-2.5 mt-8">
        {STEPS.map((step, i) => (
          <div key={i} className={`flex items-center gap-3 text-sm font-mono transition-all duration-300 ${i === stepIdx ? 'text-yellow-400 scale-105 origin-left' : i < stepIdx ? 'text-green-500' : 'text-gray-700'}`}>
            <span className="w-5">{i < stepIdx ? '✓' : i === stepIdx ? '→' : '·'}</span>
            <span className={i === stepIdx ? 'font-bold' : ''}>{step.label}</span>
          </div>
        ))}
      </div>
      
      <div className="w-full max-w-sm bg-[#17171f] rounded-full h-2 border border-[#222230] mt-6 overflow-hidden">
        <div className="bg-gradient-to-r from-yellow-500 to-orange-400 h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${Math.round(((stepIdx + 1) / STEPS.length) * 100)}%` }} />
      </div>
    </div>
  )
}

// -------------------- MAIN DASHBOARD --------------------
export default function DashboardPage() {
  const router = useRouter()
  const today = new Date().toISOString().split('T')[0]
  const todayDayName = new Date().toLocaleDateString('en-US', { weekday: 'long' })

  const [plan, setPlan] = useState<any>(null)
  const [allPlans, setAllPlans] = useState<any[]>([]) // Used to accurately track Week #
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  
  // Controls the immersive loading screen
  const [generatingWeek, setGeneratingWeek] = useState<number | null>(null)
  const [planFeedback, setPlanFeedback] = useState('')
  
  const [error, setError] = useState<string | null>(null)
  const [userName, setUserName] = useState('Athlete')

  const [todayLogs, setTodayLogs] = useState<FoodLog[]>([])
  const [streak, setStreak] = useState(0)

  // Sync state from Database
  const loadPlan = async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/me')
      if (!res.ok) { router.push('/login'); return }
      const { user } = await res.json()
      setUserName(user?.profile?.name || user?.email || 'Athlete')
      setProfile(user?.profile || null)

      // Fetch the actual current plan JSON
      const planRes = await fetch('/api/meal-plan')
      if (planRes.ok) {
        const data = await planRes.json()
        setPlan(data.plan || null)
      } else { setPlan(null) }

      // Fetch all plans to establish perfect week counts
      const allPlansRes = await fetch('/api/meal-plans')
      if (allPlansRes.ok) {
        const data = await allPlansRes.json()
        setAllPlans(data.plans || [])
      }

    } catch { setError('Failed to load your dashboard data.') }
    finally { setLoading(false) }
  }

  const loadFoodLog = useCallback(async () => {
    try {
      const res = await fetch(`/api/food-log?date=${today}`)
      if (res.ok) { const data = await res.json(); setTodayLogs(data.logs || []); setStreak(data.streak || 0) }
    } catch { /* silent */ }
  }, [today])

  useEffect(() => { loadPlan() }, [])
  useEffect(() => { if (plan) loadFoodLog() }, [plan, loadFoodLog])

  // -------------------- CORE LOGIC --------------------
  // Calculate exactly which week we are on by counting the Vault records
  const planWeek = allPlans.length > 0 ? allPlans.length : (plan ? 1 : 0)
  const paidWeeks = profile?.paid_weeks ?? 1
  
  // The roadmap shows up to the next locked week
  const totalVisibleWeeks = Math.max(planWeek, paidWeeks) + 1
  const weeksArray = Array.from({ length: totalVisibleWeeks }, (_, i) => i + 1)

  // Extract Dates from the Vault for accurate day counting
  const latestPlanRecord = allPlans.length > 0 ? allPlans[0] : null;
  const planStartDate = latestPlanRecord?.generated_at ? new Date(latestPlanRecord.generated_at) : null;
  const planDayIndex = planStartDate
    ? Math.min(7, Math.max(1, Math.floor((Date.now() - planStartDate.getTime()) / (24 * 60 * 60 * 1000)) + 1))
    : 1
  const daysLeft = planStartDate ? Math.max(0, 7 - (planDayIndex - 1)) : 7

  const todayMeals = (() => {
    const days = ensureArray(plan?.weekly_meals)
    const todayDay = days.find((d: any) => getDayName(d).toLowerCase() === todayDayName.toLowerCase())
    return ensureArray(todayDay?.meals).map(normalizeMeal)
  })()

  const eatenCount = todayMeals.filter((_, i) => todayLogs.find(l => l.meal_index === i)?.eaten).length

  // -------------------- ACTIONS --------------------
  const toggleMealEaten = async (mealIndex: number, mealName: string, eaten: boolean) => {
    setTodayLogs(prev => {
      const existing = prev.find(l => l.meal_index === mealIndex)
      if (existing) return prev.map(l => l.meal_index === mealIndex ? { ...l, eaten } : l)
      return [...prev, { plan_date: today, meal_index: mealIndex, meal_name: mealName, eaten }]
    })
    try {
      await fetch('/api/food-log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan_date: today, meal_index: mealIndex, meal_name: mealName, eaten }) })
      const res = await fetch(`/api/food-log?date=${today}`)
      if (res.ok) { const d = await res.json(); setStreak(d.streak || 0) }
    } catch { /* silent */ }
  }

  const generateWeek = async (weekNum: number) => {
    setGeneratingWeek(weekNum); setError(null)
    try {
      const res = await fetch('/api/meal-plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes: planFeedback.trim() }) })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.success) {
        await loadPlan() // Hard refresh syncs the Vault and removes the generate button!
        setPlanFeedback('')
      } else { setError(data?.error || 'Failed to generate plan') }
    } catch { setError('An error occurred while generating.') } 
    finally { setGeneratingWeek(null) }
  }

  const handleLogout = async () => {
    try { await fetch('/api/logout', { method: 'POST' }) } catch {}
    router.push('/login')
  }

  if (loading) return <div className="min-h-screen bg-[#0c0c10] text-yellow-500 flex items-center justify-center font-mono">Syncing Dashboard...</div>

  return (
    <div className="min-h-screen bg-[#0c0c10] text-white relative pb-20">
      
      {/* Immersive Loading State */}
      {generatingWeek !== null && <GeneratingScreen name={userName} week={generatingWeek} />}

      {/* Header */}
      <header className="flex items-center justify-between px-4 md:px-6 py-4 border-b border-[#222230] sticky top-0 bg-[#0c0c10]/90 backdrop-blur-md z-10">
        <h1 className="text-xl font-extrabold tracking-tight cursor-pointer">
          Aapka<span className="text-yellow-500">Coach</span>
        </h1>
        <div className="flex items-center gap-2">
          <button onClick={() => router.push('/dashboard/subscriptions')} className="text-xs bg-[#17171f] hover:bg-yellow-500/10 border border-[#222230] text-gray-300 px-3 py-2 rounded-full transition-colors hidden sm:inline">💳 Billing</button>
          <button onClick={() => router.push('/dashboard/progress')} className="text-xs bg-[#17171f] hover:bg-yellow-500/10 border border-[#222230] text-gray-300 px-3 py-2 rounded-full transition-colors hidden sm:inline">📊 Progress</button>
          <button onClick={() => router.push('/dashboard/profile')} className="text-xs bg-[#17171f] hover:bg-yellow-500/10 border border-[#222230] text-gray-300 px-3 py-2 rounded-full transition-colors">👤 Profile</button>
          <button onClick={handleLogout} className="text-xs bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 px-3 py-2 rounded-full transition-colors">Logout</button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 md:px-6 pt-6 animate-in fade-in duration-500">
        {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-6 text-red-400 text-sm font-mono text-center">{error}</div>}

        {/* TOP OVERVIEW - Compact and Clean */}
        {!plan ? (
          <div className="bg-[#17171f] border border-[#222230] rounded-3xl p-8 text-center my-12 shadow-2xl">
            <div className="text-6xl mb-6 drop-shadow-[0_0_15px_rgba(255,255,255,0.1)]">🚀</div>
            <h2 className="text-2xl font-bold mb-3 text-white">Generate Your Master Plan</h2>
            <p className="text-gray-400 text-sm mb-8 leading-relaxed px-4">
              We'll calculate your exact recomp macros, design your periodized workout splits, and arrange meals perfectly matching your dietary preferences.
            </p>
            <button 
              onClick={() => generateWeek(1)} 
              disabled={generatingWeek !== null} 
              className="w-full sm:w-auto px-10 py-4 bg-yellow-500 text-black font-extrabold text-lg rounded-2xl hover:bg-yellow-400 transition-all shadow-[0_0_20px_rgba(234,179,8,0.3)] disabled:opacity-50"
            >
              Generate Week 1 Plan
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-[#17171f] border border-[#222230] rounded-2xl p-5 shadow-sm flex flex-col justify-center">
                <p className="text-xs text-gray-500 uppercase tracking-widest font-mono">Daily Fuel</p>
                <p className="text-3xl font-extrabold text-white mt-1">{plan.daily_macros?.calories} <span className="text-sm font-normal text-gray-400">kcal</span></p>
                <button onClick={() => router.push('/dashboard/week')} className="mt-4 text-xs font-bold text-yellow-500 bg-yellow-500/10 hover:bg-yellow-500/20 py-2 rounded-lg w-full transition-colors">
                  View Full Diet Plan →
                </button>
              </div>
              <div className="flex flex-col gap-4">
                <AdherenceRing eaten={eatenCount} total={todayMeals.length} streak={streak} />
              </div>
            </div>

            {/* MACROS */}
            <MacroRings plan={plan} todayLogs={todayLogs} todayDayName={todayDayName} />

            {/* TODAY'S COMPACT CHECKLIST */}
            {todayMeals.length > 0 && (
              <div className="mb-12">
                <div className="flex items-center justify-between mb-4 border-b border-[#222230] pb-2">
                  <h2 className="text-lg font-bold text-white flex items-center gap-2"><span>🎯</span> Today's Checklist</h2>
                  <span className="text-xs text-gray-500 font-mono bg-[#17171f] border border-[#222230] px-2.5 py-1 rounded-md">{eatenCount}/{todayMeals.length}</span>
                </div>
                {todayMeals.map((meal, i) => (
                  <CompactMealCard key={i} meal={meal} mealIndex={i} todayLogs={todayLogs} onToggle={toggleMealEaten} />
                ))}
              </div>
            )}

            {/* TRANSFORMATION ROADMAP */}
            <div className="mt-8">
              <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2"><span>🗺️</span> Transformation Journey</h2>
              <div className="space-y-4 relative">
                {/* Connecting Line */}
                <div className="absolute left-6 top-6 bottom-6 w-0.5 bg-[#222230] -z-10"></div>
                
                {weeksArray.map(w => {
                  // 1. COMPLETED WEEK
                  if (w < planWeek) {
                    return (
                      <div key={w} className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-green-500/10 text-green-400 flex items-center justify-center font-bold text-lg flex-shrink-0 z-10 border-4 border-[#0c0c10]">✓</div>
                        <div className="flex-1 flex items-center justify-between p-4 bg-[#17171f] border border-[#222230] rounded-2xl opacity-75 hover:opacity-100 transition-opacity">
                          <div><p className="font-bold text-white">Week {w}</p><p className="text-[10px] text-gray-500 font-mono uppercase tracking-widest mt-0.5">Completed</p></div>
                          <button onClick={() => router.push('/dashboard/history')} className="px-4 py-2 bg-[#222230] text-gray-300 text-xs font-bold rounded-lg hover:bg-[#333] transition-colors">View Vault</button>
                        </div>
                      </div>
                    )
                  }

                  // 2. ACTIVE WEEK
                  if (w === planWeek && planWeek > 0) {
                    return (
                      <div key={w} className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-yellow-500 text-black flex items-center justify-center font-extrabold text-xl flex-shrink-0 z-10 border-4 border-[#0c0c10] shadow-[0_0_15px_rgba(234,179,8,0.4)]">⚡</div>
                        <div className="flex-1 flex items-center justify-between p-5 bg-gradient-to-r from-[#1c1c26] to-[#17171f] border border-yellow-500/50 rounded-2xl shadow-lg">
                          <div><p className="font-bold text-white text-lg">Week {w}</p><p className="text-[10px] text-yellow-500 font-mono uppercase tracking-widest mt-0.5">Current Plan</p></div>
                          <button onClick={() => router.push('/dashboard/week')} className="px-5 py-2.5 bg-yellow-500 text-black text-xs font-extrabold rounded-lg hover:bg-yellow-400 shadow-md transition-all">View Plan</button>
                        </div>
                      </div>
                    )
                  }

                  // 3. UNLOCKED (READY TO GENERATE)
                  if (w > planWeek && w <= paidWeeks) {
                    return (
                      <div key={w} className="flex gap-4">
                        <div className="w-12 h-12 rounded-full bg-[#17171f] text-gray-400 border border-[#222230] flex items-center justify-center font-bold text-lg flex-shrink-0 z-10 mt-2">🔓</div>
                        <div className="flex-1 p-5 bg-[#17171f] border border-green-500/30 rounded-2xl shadow-xl">
                          <div className="mb-4">
                            <p className="font-bold text-white text-lg">Week {w}</p>
                            <p className="text-[10px] text-green-400 font-mono uppercase tracking-widest mt-0.5">Unlocked & Ready</p>
                          </div>
                          <textarea value={planFeedback} onChange={e => setPlanFeedback(e.target.value)} placeholder="Optional: Add feedback for the AI before generating (e.g. less carbs, remove soya)..." className="w-full p-3 bg-[#0c0c10] border border-[#222230] rounded-xl text-white text-xs resize-none min-h-[70px] focus:border-yellow-500 outline-none mb-3" />
                          <button onClick={() => generateWeek(w)} className="w-full py-3.5 bg-yellow-500 text-black font-extrabold rounded-xl hover:bg-yellow-400 shadow-md transition-all">🚀 Generate Week {w}</button>
                        </div>
                      </div>
                    )
                  }

                  // 4. LOCKED
                  return (
                    <div key={w} className="flex items-center gap-4 opacity-50 grayscale hover:grayscale-0 hover:opacity-100 transition-all">
                      <div className="w-12 h-12 rounded-full bg-[#0c0c10] text-gray-600 border border-[#222230] flex items-center justify-center font-bold text-lg flex-shrink-0 z-10">🔒</div>
                      <div className="flex-1 flex items-center justify-between p-4 bg-[#0c0c10] border border-[#222230] rounded-2xl">
                        <div><p className="font-bold text-white">Week {w}</p><p className="text-[10px] text-gray-500 font-mono uppercase tracking-widest mt-0.5">Locked</p></div>
                        <button onClick={() => router.push('/dashboard/subscriptions')} className="px-4 py-2 bg-[#17171f] border border-[#222230] text-white text-xs font-bold rounded-lg hover:border-yellow-500 transition-colors">Unlock</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  )
}