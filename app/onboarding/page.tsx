'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

// ─────────────────────────────────────────────
// EXACT MATH ENGINE SYNCED WITH EDGE FUNCTION
// ─────────────────────────────────────────────
function calculateMacroTargets(form: any) {
  const weight = Number(form.weight_kg)
  const bodyFatPct = Number(form.body_fat_percent) || 17
  const sex = form.sex || 'male'
  const activity = form.activity_level || 'moderate'
  const goal = form.primary_goal || 'recomp'

  if (!weight || weight <= 0) return null

  const lbm = weight * (1 - bodyFatPct / 100);
  const bmr = Math.round(370 + 21.6 * lbm);

  let pal = 1.55;
  if (activity === 'sedentary') pal = 1.2;
  else if (activity === 'light') pal = 1.375;
  else if (activity === 'heavy') pal = 1.725;

  const tdee = Math.round(bmr * pal);

  let targetCalories = tdee;
  if (goal === 'fat_loss') {
    targetCalories = Math.max(Math.round(tdee * 0.70), sex === 'female' ? 1200 : 1500);
  } else if (goal === 'muscle_gain') {
    targetCalories = Math.round(tdee * 1.10);
  } else {
    const defPct = (bodyFatPct >= 15 && sex === 'male') || (bodyFatPct >= 22 && sex === 'female') ? 0.25 : 0.15;
    targetCalories = Math.max(Math.round(tdee * (1 - defPct)), sex === 'female' ? 1300 : 1600);
  }

  let p = Math.round(weight * 1.85);
  p = Math.max(100, Math.min(180, p));
  let f = Math.max(50, Math.min(95, Math.round(weight * 1.10)));
  let c = Math.max(60, Math.round((targetCalories - (p * 4) - (f * 9)) / 4));

  const actualCalories = (p * 4) + (f * 9) + (c * 4);

  return { calories: actualCalories, protein: p, carbs: c, fat: f }
}

// ─────────────────────────────────────────────
// DATA CONSTANTS FOR BEAUTIFUL UI CARDS
// ─────────────────────────────────────────────
const GOALS = [
  { id: 'fat_loss', icon: '🔥', title: 'Fat Loss', desc: 'Aggressive deficit to strip fat' },
  { id: 'recomp', icon: '⚡', title: 'Recomposition', desc: 'Lose fat, build muscle simultaneously' },
  { id: 'muscle_gain', icon: '💪', title: 'Muscle Gain', desc: 'Caloric surplus for maximum growth' },
]

const ACTIVITY_LEVELS = [
  { id: 'sedentary', title: 'Sedentary', desc: 'Office job, mostly sitting' },
  { id: 'light', title: 'Light', desc: '1–3 days/week light exercise' },
  { id: 'moderate', title: 'Moderate', desc: '3–5 days/week training' },
  { id: 'heavy', title: 'Heavy', desc: '6–7 days/week intense training' },
]

const DIETS = [
  { id: 'vegetarian', title: 'Vegetarian', desc: 'Paneer, Soya, Dairy, Dal (No Eggs)' },
  { id: 'eggetarian', title: 'Eggetarian', desc: 'Eggs allowed (No Meat)' },
  { id: 'non_veg', title: 'Non-Vegetarian', desc: 'Chicken, Fish, Eggs allowed' },
  { id: 'vegan', title: 'Vegan', desc: 'Strictly plant-based (No Dairy)' },
]

const TIMINGS = [
  { id: '4_meals', title: '4 Meals / Day', desc: 'Standard optimal split' },
  { id: '3_meals', title: '3 Meals / Day', desc: 'Breakfast, Lunch, Dinner' },
  { id: 'if_16_8', title: 'IF 16:8', desc: 'Fasting 12pm - 8pm window' },
  { id: 'if_14_10', title: 'IF 14:10', desc: 'Fasting 10am - 8pm window' },
  { id: '6_meals', title: '6 Meals / Day', desc: 'Frequent small meals' },
]

const ENVIRONMENTS = [
  { id: 'home_cooked', icon: '🏠', title: 'Home Cooked' },
  { id: 'hostel_mess', icon: '🏫', title: 'Hostel Mess' },
  { id: 'canteen', icon: '🍽️', title: 'Canteen' },
  { id: 'tiffin', icon: '📦', title: 'Tiffin Service' },
]

// ─────────────────────────────────────────────
// HELPER COMPONENTS
// ─────────────────────────────────────────────
const SelectCard = ({ active, title, desc, icon, onClick }: any) => (
  <button type="button" onClick={onClick} className={`text-left p-4 rounded-2xl border-2 transition-all duration-200 w-full ${active ? 'border-yellow-500 bg-yellow-500/10 scale-[1.02]' : 'border-[#222230] bg-[#17171f] hover:border-yellow-500/30'}`}>
    <div className="flex items-center gap-3">
      {icon && <span className="text-2xl">{icon}</span>}
      <div>
        <p className={`font-bold ${active ? 'text-yellow-400' : 'text-white'}`}>{title}</p>
        {desc && <p className="text-xs text-gray-400 mt-1">{desc}</p>}
      </div>
    </div>
  </button>
)

const InputField = ({ label, value, onChange, placeholder, type = "text", step }: any) => (
  <div className="w-full">
    <label className="block text-xs font-mono uppercase tracking-wider text-gray-400 mb-1.5">{label}</label>
    <input type={type} step={step} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="w-full p-3.5 bg-[#17171f] border border-[#222230] rounded-xl text-white focus:border-yellow-500 outline-none transition-all focus:ring-4 focus:ring-yellow-500/10 placeholder-gray-600" />
  </div>
)

// ─────────────────────────────────────────────
// IMMERSIVE LOADING SCREEN COMPONENT
// ─────────────────────────────────────────────
function GeneratingScreen({ name, goal }: { name: string; goal: string }) {
  const [stepIdx, setStepIdx] = useState(0)
  
  const formattedName = name ? name.split(' ')[0] : 'your'
  const formattedGoal = goal.replace('_', ' ')

  const STEPS = [
    { icon: '⚖️', label: `Analyzing ${formattedName}'s body metrics…` },
    { icon: '🔥', label: `Calculating BMR & TDEE for ${formattedGoal}…` },
    { icon: '🥩', label: 'Setting exact macro splits (Protein, Carbs, Fats)…' },
    { icon: '🍱', label: `Structuring 7-day intelligent meal plan…` },
    { icon: '🏋️', label: `Designing periodized workout split…` },
    { icon: '🌙', label: 'Adding lifestyle & sleep protocols…' },
    { icon: '🚀', label: 'Finalizing AapkaCoach Master Plan…' },
  ]

  useEffect(() => {
    // Progress through steps every 3.5 seconds
    const t = setInterval(() => setStepIdx(i => Math.min(i + 1, STEPS.length - 1)), 3500)
    return () => clearInterval(t)
  }, [STEPS.length])
  
  const s = STEPS[stepIdx]
  
  return (
    <div className="min-h-screen bg-[#0c0c10] text-white flex flex-col items-center justify-center gap-6 px-6 fixed inset-0 z-50">
      <div className="text-6xl animate-bounce">{s.icon}</div>
      <div className="text-center max-w-sm">
        <p className="text-xl font-bold font-mono text-white leading-relaxed">{s.label}</p>
        <p className="text-sm text-yellow-500 mt-3 animate-pulse">Do not close this tab.</p>
      </div>
      
      <div className="w-full max-w-xs space-y-2 mt-6">
        {STEPS.map((step, i) => (
          <div key={i} className={`flex items-center gap-2 text-xs font-mono transition-all duration-300 ${i === stepIdx ? 'text-yellow-400' : i < stepIdx ? 'text-green-500' : 'text-gray-700'}`}>
            <span>{i < stepIdx ? '✓' : i === stepIdx ? '→' : '·'}</span>
            <span className={i === stepIdx ? 'font-bold' : ''}>{step.label}</span>
          </div>
        ))}
      </div>
      
      <div className="w-full max-w-xs bg-[#17171f] rounded-full h-1.5 border border-[#222230] mt-4 overflow-hidden">
        <div 
          className="bg-gradient-to-r from-yellow-500 to-orange-400 h-full rounded-full transition-all duration-700 ease-out" 
          style={{ width: `${Math.round(((stepIdx + 1) / STEPS.length) * 100)}%` }} 
        />
      </div>
    </div>
  )
}


// ─────────────────────────────────────────────
// MAIN PAGE COMPONENT
// ─────────────────────────────────────────────
export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [authCheckDone, setAuthCheckDone] = useState(false)
  
  // View states
  const [loading, setLoading] = useState(false)
  const [showGeneratingScreen, setShowGeneratingScreen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/me')
        if (!res.ok) { router.push('/login'); return; }
        setAuthCheckDone(true)
      } catch (error) { router.push('/login') }
    }
    checkAuth()
  }, [router])

  const [form, setForm] = useState({
    name: '', age: '', sex: 'male', height_cm: '', weight_kg: '',
    body_fat_percent: '', visceral_fat: '', waist_inches: '', upper_abdomen_inches: '', hips_inches: '',
    body_age: '', rmr_estimated: '', dietary_pattern: 'vegetarian', meal_timing: '4_meals',
    eating_environment: 'hostel_mess', activity_level: 'moderate', sleep_hours: '', stress_level: '5',
    primary_goal: 'recomp', target_bf_percent: '', timeframe_weeks: '8', supplements: '', plan_notes: '', food_type: 'indian',
  })

  const update = (field: string, value: any) => {
    setError(null);
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const macroTargets = useMemo(() => calculateMacroTargets(form), [form])

  const nextStep = () => {
    if (step === 0 && (!form.name || !form.age || !form.height_cm || !form.weight_kg)) {
      setError("Please fill out your basic details before continuing."); return;
    }
    setError(null);
    setStep(s => Math.min(s + 1, 4));
  }
  const prevStep = () => setStep(s => Math.max(s - 1, 0))

  const handleSubmit = async () => {
    if (!form.name || !form.age || !form.height_cm || !form.weight_kg) {
      setError('Please fill in all required fields'); return;
    }

    // Trigger full screen immersive loading state
    setShowGeneratingScreen(true)
    setError(null);

    try {
      const profileRes = await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name, age: parseInt(form.age), sex: form.sex,
          height_cm: parseFloat(form.height_cm), weight_kg: parseFloat(form.weight_kg),
          body_fat_percent: form.body_fat_percent ? parseFloat(form.body_fat_percent) : null,
          visceral_fat: form.visceral_fat ? parseFloat(form.visceral_fat) : null,
          waist_inches: form.waist_inches ? parseFloat(form.waist_inches) : null,
          upper_abdomen_inches: form.upper_abdomen_inches ? parseFloat(form.upper_abdomen_inches) : null,
          hips_inches: form.hips_inches ? parseFloat(form.hips_inches) : null,
          body_age: form.body_age ? parseInt(form.body_age) : null,
          rmr_estimated: form.rmr_estimated ? parseFloat(form.rmr_estimated) : null,
          dietary_pattern: form.dietary_pattern, meal_timing: form.meal_timing,
          eating_environment: form.eating_environment, activity_level: form.activity_level,
          sleep_hours: form.sleep_hours ? parseFloat(form.sleep_hours) : null,
          stress_level: parseInt(form.stress_level), primary_goal: form.primary_goal,
          target_bf_percent: form.target_bf_percent ? parseFloat(form.target_bf_percent) : null,
          timeframe_weeks: parseInt(form.timeframe_weeks), supplements: form.supplements.trim() || null,
          plan_notes: form.plan_notes.trim() || null, food_type: form.food_type || 'indian',
          onboarding_completed: true,
        }),
      })

      if (!profileRes.ok) {
        const data = await profileRes.json(); throw new Error(data.error || 'Failed to save profile');
      }

      const planRes = await fetch('/api/meal-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: form.plan_notes.trim() || '', food_type: form.food_type || 'indian' }),
      })

      const planData = await planRes.json().catch(() => null)
      if (!planRes.ok || !planData?.success) throw new Error(planData?.error || 'Failed to generate plan.');

      router.push('/dashboard')
    } catch (err: any) {
      setError(err.message || 'An error occurred.'); 
      setShowGeneratingScreen(false) // Turn off the immersive screen if it crashes
    }
  }

  // If the user clicks submit, hijack the entire UI to show the immersive loading screen
  if (showGeneratingScreen) {
    return <GeneratingScreen name={form.name} goal={form.primary_goal} />
  }

  if (!authCheckDone) return <div className="min-h-screen bg-[#0c0c10] flex items-center justify-center"><div className="w-8 h-8 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin"></div></div>

  const stepTitles = ['The Basics', 'Body Scan Metrics', 'Daily Lifestyle', 'Diet & Preferences', 'Your Ultimate Goal']

  return (
    <div className="min-h-screen bg-[#0c0c10] text-white flex flex-col items-center py-10 px-4">
      
      {/* Top Progress Bar */}
      <div className="w-full max-w-2xl mb-8">
        <div className="flex gap-2 w-full">
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${i <= step ? 'bg-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.5)]' : 'bg-[#222230]'}`} />
          ))}
        </div>
        <p className="text-center text-xs font-mono text-gray-500 mt-4 uppercase tracking-widest">Step {step + 1} of 5</p>
        <h1 className="text-3xl font-extrabold text-center mt-2 tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-400">
          {stepTitles[step]}
        </h1>
      </div>

      {/* Animated Step Container */}
      <div key={step} className="w-full max-w-2xl animate-in fade-in slide-in-from-bottom-6 duration-500 pb-32">
        
        {/* STEP 0: BASICS */}
        {step === 0 && (
          <div className="space-y-6">
            <InputField label="Full Name" value={form.name} onChange={(v:any) => update('name', v)} placeholder="e.g. Abhinav Gupta" />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-gray-400 mb-1.5">Sex</label>
                <div className="flex gap-2 bg-[#17171f] p-1.5 rounded-xl border border-[#222230]">
                  <button type="button" onClick={() => update('sex', 'male')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${form.sex === 'male' ? 'bg-yellow-500 text-black' : 'text-gray-400 hover:text-white'}`}>Male</button>
                  <button type="button" onClick={() => update('sex', 'female')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${form.sex === 'female' ? 'bg-yellow-500 text-black' : 'text-gray-400 hover:text-white'}`}>Female</button>
                </div>
              </div>
              <InputField label="Age" type="number" value={form.age} onChange={(v:any) => update('age', v)} placeholder="23" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <InputField label="Height (cm)" type="number" step="0.1" value={form.height_cm} onChange={(v:any) => update('height_cm', v)} placeholder="178" />
              <InputField label="Weight (kg)" type="number" step="0.1" value={form.weight_kg} onChange={(v:any) => update('weight_kg', v)} placeholder="74.5" />
            </div>
          </div>
        )}

        {/* STEP 1: BODY COMP */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="bg-yellow-500/10 border border-yellow-500/20 p-4 rounded-xl mb-4">
              <p className="text-yellow-400 text-sm">💡 Optional but highly recommended. Entering Body Fat % makes your caloric calculations significantly more accurate.</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <InputField label="Body Fat %" type="number" step="0.1" value={form.body_fat_percent} onChange={(v:any) => update('body_fat_percent', v)} placeholder="17" />
              <InputField label="Visceral Fat" type="number" step="0.1" value={form.visceral_fat} onChange={(v:any) => update('visceral_fat', v)} placeholder="8.5" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <InputField label="Waist (in)" type="number" step="0.1" value={form.waist_inches} onChange={(v:any) => update('waist_inches', v)} placeholder="32" />
              <InputField label="Abdomen (in)" type="number" step="0.1" value={form.upper_abdomen_inches} onChange={(v:any) => update('upper_abdomen_inches', v)} placeholder="31" />
              <InputField label="Hips (in)" type="number" step="0.1" value={form.hips_inches} onChange={(v:any) => update('hips_inches', v)} placeholder="38" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <InputField label="Body Age" type="number" value={form.body_age} onChange={(v:any) => update('body_age', v)} placeholder="32" />
              <InputField label="RMR (kcal)" type="number" value={form.rmr_estimated} onChange={(v:any) => update('rmr_estimated', v)} placeholder="1750" />
            </div>
          </div>
        )}

        {/* STEP 2: LIFESTYLE */}
        {step === 2 && (
          <div className="space-y-8">
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-gray-400 mb-3">Activity Level</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {ACTIVITY_LEVELS.map(a => (
                  <SelectCard key={a.id} active={form.activity_level === a.id} title={a.title} desc={a.desc} onClick={() => update('activity_level', a.id)} />
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-6">
              <InputField label="Sleep (Hours)" type="number" step="0.5" value={form.sleep_hours} onChange={(v:any) => update('sleep_hours', v)} placeholder="7.5" />
              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-gray-400 mb-1.5">Stress (1-10)</label>
                <div className="bg-[#17171f] border border-[#222230] p-3.5 rounded-xl flex items-center gap-4">
                  <input type="range" min="1" max="10" value={form.stress_level} onChange={e => update('stress_level', e.target.value)} className="w-full accent-yellow-500" />
                  <span className="font-bold font-mono text-yellow-500">{form.stress_level}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: DIET */}
        {step === 3 && (
          <div className="space-y-8">
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-gray-400 mb-3">Dietary Pattern</label>
              <div className="grid grid-cols-2 gap-3">
                {DIETS.map(d => (
                  <SelectCard key={d.id} active={form.dietary_pattern === d.id} title={d.title} desc={d.desc} onClick={() => update('dietary_pattern', d.id)} />
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-gray-400 mb-3">Eating Environment</label>
              <div className="grid grid-cols-2 gap-3">
                {ENVIRONMENTS.map(e => (
                  <SelectCard key={e.id} active={form.eating_environment === e.id} title={e.title} icon={e.icon} onClick={() => update('eating_environment', e.id)} />
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-gray-400 mb-3">Meal Timing / Fasting</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {TIMINGS.map(t => (
                  <SelectCard key={t.id} active={form.meal_timing === t.id} title={t.title} desc={t.desc} onClick={() => update('meal_timing', t.id)} />
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-gray-400 mb-1.5">Food Origin Preference</label>
              <select value={form.food_type} onChange={e => update('food_type', e.target.value)} className="w-full p-3.5 bg-[#17171f] border border-[#222230] rounded-xl text-white outline-none focus:border-yellow-500">
                <option value="indian">Indian Foods</option>
                <option value="english">Western / English Foods</option>
                <option value="mixed">Mixed</option>
              </select>
            </div>
          </div>
        )}

        {/* STEP 4: GOALS */}
        {step === 4 && (
          <div className="space-y-8">
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-gray-400 mb-3">Primary Goal</label>
              <div className="grid grid-cols-1 gap-3">
                {GOALS.map(g => (
                  <SelectCard key={g.id} active={form.primary_goal === g.id} title={g.title} desc={g.desc} icon={g.icon} onClick={() => update('primary_goal', g.id)} />
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-6">
              <InputField label="Target BF %" type="number" step="0.1" value={form.target_bf_percent} onChange={(v:any) => update('target_bf_percent', v)} placeholder="13.5" />
              <InputField label="Timeframe (Weeks)" type="number" value={form.timeframe_weeks} onChange={(v:any) => update('timeframe_weeks', v)} placeholder="8" />
            </div>
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-gray-400 mb-1.5">Special Notes for the AI</label>
              <textarea value={form.plan_notes} onChange={e => update('plan_notes', e.target.value)} placeholder="e.g. Hate broccoli, allergic to peanuts, train at 6 PM..." className="w-full p-4 bg-[#17171f] border border-[#222230] rounded-xl text-white outline-none focus:border-yellow-500 min-h-[100px] resize-none" />
            </div>
          </div>
        )}

        {error && <div className="mt-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm text-center animate-in zoom-in-95 duration-200">{error}</div>}
      </div>

      {/* Floating Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 w-full bg-[#0c0c10]/80 backdrop-blur-xl border-t border-[#222230] p-4 z-40">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          
          {/* Live Macro Preview */}
          <div className="flex-1">
            {macroTargets && form.weight_kg ? (
              <div className="animate-in fade-in duration-500">
                <p className="text-[10px] uppercase tracking-widest text-gray-500 font-mono mb-0.5">Calculated Targets</p>
                <div className="flex gap-3 text-sm font-bold">
                  <span className="text-yellow-400">{macroTargets.calories} kcal</span>
                  <span className="text-green-400">{macroTargets.protein}g P</span>
                  <span className="text-blue-400 hidden sm:inline">{macroTargets.carbs}g C</span>
                  <span className="text-orange-400 hidden sm:inline">{macroTargets.fat}g F</span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-600 font-mono">Fill weight to see macros...</p>
            )}
          </div>

          <div className="flex gap-3">
            {step > 0 && (
              <button onClick={prevStep} disabled={loading} className="px-5 py-3 border-2 border-[#222230] text-gray-300 rounded-xl hover:bg-[#17171f] hover:text-white transition-all font-semibold">
                Back
              </button>
            )}
            {step < 4 ? (
              <button onClick={nextStep} className="px-8 py-3 bg-yellow-500 text-black rounded-xl font-extrabold hover:bg-yellow-400 transition-all shadow-lg shadow-yellow-500/20">
                Continue
              </button>
            ) : (
              <button onClick={handleSubmit} className="px-8 py-3 bg-yellow-500 text-black rounded-xl font-extrabold hover:bg-yellow-400 transition-all shadow-lg shadow-yellow-500/20">
                Generate Plan
              </button>
            )}
          </div>
        </div>
      </div>

    </div>
  )
}