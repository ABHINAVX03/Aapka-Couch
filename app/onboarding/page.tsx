'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

function getActivityMultiplier(activity: string) {
  switch (activity) {
    case 'sedentary': return 1.2
    case 'light': return 1.375
    case 'moderate': return 1.55
    case 'heavy': return 1.725
    default: return 1.55
  }
}

function getGoalAdjustment(goal: string) {
  switch (goal) {
    case 'fat_loss': return -400
    case 'muscle_gain': return 250
    case 'recomp': return -100
    default: return -100
  }
}

function calculateMacroTargets(form: any) {
  const weight = Number(form.weight_kg)
  const height = Number(form.height_cm)
  const age = Number(form.age)
  const sex = form.sex
  const activity = form.activity_level
  const goal = form.primary_goal

  if (!weight || !height || !age) return null

  const bmr = sex === 'female'
    ? 10 * weight + 6.25 * height - 5 * age - 161
    : 10 * weight + 6.25 * height - 5 * age + 5

  const tdee = Math.round(bmr * getActivityMultiplier(activity))
  const adjusted = tdee + getGoalAdjustment(goal)
  const calories = Math.max(1200, Math.round(adjusted))
  const protein = Math.max(0, Math.round(weight * 2))
  const fat = Math.max(0, Math.round(weight * 0.9))
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4))

  return { calories, protein, carbs, fat }
}

const TOTAL_STEPS = 5
const stepLabels = ['About You', 'Body Scan', 'Lifestyle', 'Diet', 'Goals']
const stepDescriptions = [
  "Let's start with the basics.",
  "Enter your latest BCA or tape measurements.",
  "Tell us about your daily routine.",
  "Dietary preferences and budget.",
  "What do you want to achieve?",
];

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [authCheckDone, setAuthCheckDone] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ------ AUTH GUARD ------
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/me')
        if (!res.ok) {
          router.push('/login')
          return
        }
        setAuthCheckDone(true)
      } catch (error) {
        console.error('Auth check error:', error)
        router.push('/login')
      }
    }
    checkAuth()
  }, [router])

  // ------ FORM STATE ------
  const [form, setForm] = useState({
    name: '',
    age: '',
    sex: 'male',
    height_cm: '',
    weight_kg: '',
    body_fat_percent: '',
    visceral_fat: '',
    waist_inches: '',
    upper_abdomen_inches: '',
    hips_inches: '',
    body_age: '',
    rmr_estimated: '',
    dietary_pattern: 'eggetarian',
    meal_timing: 'if_14_10',
    eating_environment: 'hostel_mess',
    daily_budget: '',
    activity_level: 'moderate',
    sleep_hours: '',
    stress_level: '5',
    primary_goal: 'recomp',
    target_bf_percent: '',
    timeframe_weeks: '8',
    supplements: '',
    plan_notes: '',
    food_type: 'indian',
  })

  const update = (field: string, value: any) =>
    setForm(prev => ({ ...prev, [field]: value }))

  const macroTargets = useMemo(() => calculateMacroTargets(form), [form])
  const nextStep = () => setStep(s => Math.min(s + 1, TOTAL_STEPS - 1))
  const prevStep = () => setStep(s => Math.max(s - 1, 0))

  const handleSubmit = async () => {
    setLoading(true)
    setError(null)

    try {
      // Validate required fields
      if (!form.name || !form.age || !form.height_cm || !form.weight_kg) {
        setError('Please fill in all required fields')
        setLoading(false)
        return
      }

      // Step 1: Save profile data
      const profileRes = await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          age: parseInt(form.age),
          sex: form.sex,
          height_cm: parseFloat(form.height_cm),
          weight_kg: parseFloat(form.weight_kg),
          body_fat_percent: form.body_fat_percent ? parseFloat(form.body_fat_percent) : null,
          visceral_fat: form.visceral_fat ? parseFloat(form.visceral_fat) : null,
          waist_inches: form.waist_inches ? parseFloat(form.waist_inches) : null,
          upper_abdomen_inches: form.upper_abdomen_inches ? parseFloat(form.upper_abdomen_inches) : null,
          hips_inches: form.hips_inches ? parseFloat(form.hips_inches) : null,
          body_age: form.body_age ? parseInt(form.body_age) : null,
          rmr_estimated: form.rmr_estimated ? parseFloat(form.rmr_estimated) : null,
          dietary_pattern: form.dietary_pattern,
          meal_timing: form.meal_timing,
          eating_environment: form.eating_environment,
          daily_budget: form.daily_budget ? parseFloat(form.daily_budget) : null,
          activity_level: form.activity_level,
          sleep_hours: form.sleep_hours ? parseFloat(form.sleep_hours) : null,
          stress_level: parseInt(form.stress_level),
          primary_goal: form.primary_goal,
          target_bf_percent: form.target_bf_percent ? parseFloat(form.target_bf_percent) : null,
          timeframe_weeks: parseInt(form.timeframe_weeks),
          supplements: form.supplements.trim() || null,
          plan_notes: form.plan_notes.trim() || null,
          food_type: form.food_type || 'indian',
          onboarding_completed: true,
        }),
      })

      if (!profileRes.ok) {
        const data = await profileRes.json()
        setError(data.error || 'Failed to save profile')
        setLoading(false)
        return
      }

      // Step 2: Trigger AI plan generation via the correct endpoint
      // FIX: was calling /api/meal-plan (wrong). Must call /api/generate-plan.
      const planRes = await fetch('/api/generate-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: form.plan_notes.trim() || '',
          food_type: form.food_type || 'indian',
        }),
      })

      const planData = await planRes.json().catch(() => null)

      if (!planRes.ok || !planData?.success) {
        setError(planData?.error || 'Failed to generate plan. Please try again.')
        setLoading(false)
        return
      }

      // Success — redirect to dashboard
      router.push('/dashboard')
    } catch (err) {
      console.error('Submit error:', err)
      setError('An error occurred. Please try again.')
      setLoading(false)
    }
  }

  // ------ RENDER STEP ------
  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <div className="space-y-4">
            <label className="block text-sm font-medium text-gray-300">Full Name</label>
            <input
              type="text"
              value={form.name}
              onChange={e => update('name', e.target.value)}
              placeholder="e.g., Abhinav Gupta"
              className="w-full p-3 bg-[#17171f] border border-[#222230] rounded-lg text-white"
            />
            <div className="flex gap-4">
              <div className="w-1/2">
                <label className="block text-sm font-medium text-gray-300 mb-1">Sex</label>
                <select
                  value={form.sex}
                  onChange={e => update('sex', e.target.value)}
                  className="w-full p-3 bg-[#17171f] border border-[#222230] rounded-lg text-white"
                >
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </div>
              <div className="w-1/2">
                <label className="block text-sm font-medium text-gray-300 mb-1">Age</label>
                <input
                  type="number"
                  value={form.age}
                  onChange={e => update('age', e.target.value)}
                  placeholder="23"
                  className="w-full p-3 bg-[#17171f] border border-[#222230] rounded-lg text-white"
                />
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-1/2">
                <label className="block text-sm font-medium text-gray-300 mb-1">Height (cm)</label>
                <input
                  type="number"
                  value={form.height_cm}
                  onChange={e => update('height_cm', e.target.value)}
                  placeholder="178"
                  className="w-full p-3 bg-[#17171f] border border-[#222230] rounded-lg text-white"
                />
              </div>
              <div className="w-1/2">
                <label className="block text-sm font-medium text-gray-300 mb-1">Weight (kg)</label>
                <input
                  type="number"
                  value={form.weight_kg}
                  onChange={e => update('weight_kg', e.target.value)}
                  placeholder="74"
                  className="w-full p-3 bg-[#17171f] border border-[#222230] rounded-lg text-white"
                />
              </div>
            </div>
          </div>
        )

      case 1:
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Body Fat %</label>
              <input
                type="number"
                step="0.1"
                value={form.body_fat_percent}
                onChange={e => update('body_fat_percent', e.target.value)}
                placeholder="17"
                className="w-full p-3 bg-[#17171f] border border-[#222230] rounded-lg text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Visceral Fat</label>
              <input
                type="number"
                step="0.1"
                value={form.visceral_fat}
                onChange={e => update('visceral_fat', e.target.value)}
                placeholder="8.5"
                className="w-full p-3 bg-[#17171f] border border-[#222230] rounded-lg text-white"
              />
            </div>
            <div className="flex gap-4">
              <div className="w-1/2">
                <label className="block text-sm font-medium text-gray-300 mb-1">Waist (in)</label>
                <input
                  type="number"
                  step="0.1"
                  value={form.waist_inches}
                  onChange={e => update('waist_inches', e.target.value)}
                  placeholder="32.4"
                  className="w-full p-3 bg-[#17171f] border border-[#222230] rounded-lg text-white"
                />
              </div>
              <div className="w-1/2">
                <label className="block text-sm font-medium text-gray-300 mb-1">Upper Abdomen (in)</label>
                <input
                  type="number"
                  step="0.1"
                  value={form.upper_abdomen_inches}
                  onChange={e => update('upper_abdomen_inches', e.target.value)}
                  placeholder="31"
                  className="w-full p-3 bg-[#17171f] border border-[#222230] rounded-lg text-white"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Hips (in)</label>
              <input
                type="number"
                step="0.1"
                value={form.hips_inches}
                onChange={e => update('hips_inches', e.target.value)}
                placeholder="39"
                className="w-full p-3 bg-[#17171f] border border-[#222230] rounded-lg text-white"
              />
            </div>
            <div className="flex gap-4">
              <div className="w-1/2">
                <label className="block text-sm font-medium text-gray-300 mb-1">Body Age</label>
                <input
                  type="number"
                  value={form.body_age}
                  onChange={e => update('body_age', e.target.value)}
                  placeholder="32"
                  className="w-full p-3 bg-[#17171f] border border-[#222230] rounded-lg text-white"
                />
              </div>
              <div className="w-1/2">
                <label className="block text-sm font-medium text-gray-300 mb-1">RMR (kcal)</label>
                <input
                  type="number"
                  value={form.rmr_estimated}
                  onChange={e => update('rmr_estimated', e.target.value)}
                  placeholder="1723"
                  className="w-full p-3 bg-[#17171f] border border-[#222230] rounded-lg text-white"
                />
              </div>
            </div>
          </div>
        )

      case 2:
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Activity Level</label>
              <select
                value={form.activity_level}
                onChange={e => update('activity_level', e.target.value)}
                className="w-full p-3 bg-[#17171f] border border-[#222230] rounded-lg text-white"
              >
                <option value="sedentary">Sedentary</option>
                <option value="light">Light (1‑2x/week)</option>
                <option value="moderate">Moderate (3‑4x/week)</option>
                <option value="heavy">Heavy (5‑6x/week)</option>
              </select>
            </div>
            <div className="flex gap-4">
              <div className="w-1/2">
                <label className="block text-sm font-medium text-gray-300 mb-1">Sleep (hours)</label>
                <input
                  type="number"
                  step="0.5"
                  value={form.sleep_hours}
                  onChange={e => update('sleep_hours', e.target.value)}
                  placeholder="7"
                  className="w-full p-3 bg-[#17171f] border border-[#222230] rounded-lg text-white"
                />
              </div>
              <div className="w-1/2">
                <label className="block text-sm font-medium text-gray-300 mb-1">Stress (1‑10)</label>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={form.stress_level}
                  onChange={e => update('stress_level', e.target.value)}
                  className="w-full mt-2"
                />
                <p className="text-xs text-gray-500 mt-1">{form.stress_level}/10</p>
              </div>
            </div>
          </div>
        )

      case 3:
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Dietary Pattern</label>
              <select
                value={form.dietary_pattern}
                onChange={e => update('dietary_pattern', e.target.value)}
                className="w-full p-3 bg-[#17171f] border border-[#222230] rounded-lg text-white"
              >
                <option value="eggetarian">Eggetarian</option>
                <option value="vegetarian">Vegetarian</option>
                <option value="non_veg">Non‑Vegetarian</option>
                <option value="vegan">Vegan</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Meal Timing</label>
              <select
                value={form.meal_timing}
                onChange={e => update('meal_timing', e.target.value)}
                className="w-full p-3 bg-[#17171f] border border-[#222230] rounded-lg text-white"
              >
                <option value="if_14_10">Intermittent Fasting (14:10)</option>
                <option value="if_16_8">Intermittent Fasting (16:8)</option>
                <option value="3_meals">3 meals / day</option>
                <option value="4_meals">4 meals / day</option>
                <option value="6_meals">6 small meals / day</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Eating Environment</label>
              <select
                value={form.eating_environment}
                onChange={e => update('eating_environment', e.target.value)}
                className="w-full p-3 bg-[#17171f] border border-[#222230] rounded-lg text-white"
              >
                <option value="home_cooked">Home‑cooked</option>
                <option value="hostel_mess">Hostel mess</option>
                <option value="canteen">College canteen</option>
                <option value="tiffin">Tiffin service</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Daily Food Budget (₹)</label>
              <input
                type="number"
                value={form.daily_budget}
                onChange={e => update('daily_budget', e.target.value)}
                placeholder="150"
                className="w-full p-3 bg-[#17171f] border border-[#222230] rounded-lg text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Supplements / Vitamins</label>
              <textarea
                value={form.supplements}
                onChange={e => update('supplements', e.target.value)}
                placeholder="e.g. whey, multivitamin, fish oil, creatine"
                className="w-full p-3 min-h-[100px] bg-[#17171f] border border-[#222230] rounded-lg text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Any notes for your weekly plan?</label>
              <textarea
                value={form.plan_notes}
                onChange={e => update('plan_notes', e.target.value)}
                placeholder="Tell us what worked, what didn't, or what you want changed."
                className="w-full p-3 min-h-[100px] bg-[#17171f] border border-[#222230] rounded-lg text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Preferred Food Type</label>
              <select
                value={form.food_type}
                onChange={e => update('food_type', e.target.value)}
                className="w-full p-3 bg-[#17171f] border border-[#222230] rounded-lg text-white"
              >
                <option value="indian">Indian</option>
                <option value="english">English / Western</option>
                <option value="mixed">Mixed</option>
              </select>
            </div>
          </div>
        )

      case 4:
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Primary Goal</label>
              <select
                value={form.primary_goal}
                onChange={e => update('primary_goal', e.target.value)}
                className="w-full p-3 bg-[#17171f] border border-[#222230] rounded-lg text-white"
              >
                <option value="fat_loss">Fat Loss</option>
                <option value="muscle_gain">Muscle Gain</option>
                <option value="recomp">Body Recomposition</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Target Body Fat %</label>
              <input
                type="number"
                step="0.1"
                value={form.target_bf_percent}
                onChange={e => update('target_bf_percent', e.target.value)}
                placeholder="13.5"
                className="w-full p-3 bg-[#17171f] border border-[#222230] rounded-lg text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Timeframe (weeks)</label>
              <input
                type="number"
                value={form.timeframe_weeks}
                onChange={e => update('timeframe_weeks', e.target.value)}
                placeholder="8"
                className="w-full p-3 bg-[#17171f] border border-[#222230] rounded-lg text-white"
              />
            </div>

            {macroTargets && (
              <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Based on your data</p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {macroTargets.calories} kcal | {macroTargets.protein}g protein | {macroTargets.carbs}g carbs
                </p>
              </div>
            )}
          </div>
        )

      default:
        return null
    }
  }

  // Don't render the form until auth check completes
  if (!authCheckDone) {
    return (
      <div className="min-h-screen bg-[#0c0c10] text-white flex items-center justify-center">
        Loading...
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0c0c10] text-white p-4">
      <div className="w-full max-w-xl">
        <div className="mb-8">
          <p className="text-xs text-gray-500 uppercase tracking-[2px]">{stepLabels[step]}</p>
          <h2 className="text-2xl font-bold mt-1">{stepDescriptions[step]}</h2>
          <div className="flex gap-1 mt-4">
            {stepLabels.map((_, i) => (
              <div key={i} className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-yellow-500' : 'bg-gray-800'}`} />
            ))}
          </div>
        </div>

        {renderStep()}

        {/* FIX: error now renders above buttons, not below them */}
        {error && <p className="text-red-400 text-sm mt-4 mb-2">{error}</p>}

        <div className="flex justify-between mt-4">
          {step > 0 && (
            <button onClick={prevStep} disabled={loading} className="px-6 py-2 border border-yellow-500 text-yellow-500 rounded-lg disabled:opacity-50">
              Back
            </button>
          )}
          {step < TOTAL_STEPS - 1 ? (
            <button onClick={nextStep} disabled={loading} className="px-6 py-2 bg-yellow-500 text-black rounded-lg ml-auto font-semibold disabled:opacity-50">
              Next
            </button>
          ) : (
            <button onClick={handleSubmit} disabled={loading} className="px-6 py-2 bg-yellow-500 text-black rounded-lg ml-auto font-bold disabled:opacity-50">
              {loading ? 'Generating your plan…' : 'Generate Plan'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}