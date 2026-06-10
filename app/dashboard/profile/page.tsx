'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

const ACTIVITY_LEVELS = [
  { value: 'sedentary', label: 'Sedentary', desc: 'Office job, little movement' },
  { value: 'light', label: 'Light', desc: '1–3 days/week exercise' },
  { value: 'moderate', label: 'Moderate', desc: '3–5 days/week exercise' },
  { value: 'heavy', label: 'Heavy', desc: '6–7 days/week hard training' },
]

const GOALS = [
  { value: 'fat_loss', label: '🔥 Fat Loss', desc: 'Burn fat, maintain muscle' },
  { value: 'muscle_gain', label: '💪 Muscle Gain', desc: 'Build size and strength' },
  { value: 'recomp', label: '⚡ Recomp', desc: 'Lose fat & gain muscle simultaneously' },
]

const DIETARY_PATTERNS = [
  { value: 'vegan', label: 'Vegan' },
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'eggetarian', label: 'Eggetarian' },
  { value: 'non_veg', label: 'Non-Veg' },
]

const MEAL_TIMINGS = [
  { value: '3_meals', label: '3 Meals/Day' },
  { value: 'if_16_8', label: 'IF 16:8 (12pm–8pm)' },
  { value: 'if_14_10', label: 'IF 14:10 (10am–8pm)' },
  { value: '4_meals', label: '4 Meals/Day' },
]

interface FormField {
  name: string
  age: string
  weight_kg: string
  body_fat_percent: string
  height_cm: string
  visceral_fat: string
  waist_inches: string
  upper_abdomen_inches: string
  hips_inches: string
  body_age: string
  rmr_estimated: string
  activity_level: string
  sleep_hours: string
  stress_level: string
  daily_budget: string
  dietary_pattern: string
  meal_timing: string
  eating_environment: string
  primary_goal: string
  target_bf_percent: string
  timeframe_weeks: string
  supplements: string
  plan_notes: string
  food_type: string
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#17171f] border border-[#222230] rounded-2xl p-5 space-y-4">
      <h2 className="font-bold text-yellow-500 font-mono uppercase tracking-wider text-sm border-b border-[#222230] pb-3">{title}</h2>
      {children}
    </div>
  )
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="text-xs text-gray-400 font-mono uppercase tracking-wider block mb-1">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-gray-600 mt-1">{hint}</p>}
    </div>
  )
}

const inputCls = "w-full p-3 bg-[#0c0c10] border border-[#222230] rounded-xl text-white focus:border-yellow-500 outline-none transition-colors text-sm"

export default function ProfileEditPage() {
  const router = useRouter()
  const [form, setForm] = useState<FormField>({
    name: '', age: '', weight_kg: '', body_fat_percent: '', height_cm: '',
    visceral_fat: '', waist_inches: '', upper_abdomen_inches: '', hips_inches: '',
    body_age: '', rmr_estimated: '', activity_level: 'moderate', sleep_hours: '',
    stress_level: '5', daily_budget: '', dietary_pattern: 'eggetarian',
    meal_timing: '3_meals', eating_environment: 'home_cooked',
    primary_goal: 'recomp', target_bf_percent: '', timeframe_weeks: '8',
    supplements: '', plan_notes: '', food_type: 'indian',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState('')
  const [deleteEmail, setDeleteEmail] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null)

  useEffect(() => { fetchProfile() }, [])

  const fetchProfile = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/me')
      if (!res.ok) { router.push('/login'); return }
      const { user } = await res.json()
      setUserEmail(user?.email ?? '')
      const p = user?.profile
      if (p) {
        setForm({
          name: p.name ?? '',
          age: p.age?.toString() ?? '',
          weight_kg: p.weight_kg?.toString() ?? '',
          body_fat_percent: p.body_fat_percent?.toString() ?? '',
          height_cm: p.height_cm?.toString() ?? '',
          visceral_fat: p.visceral_fat?.toString() ?? '',
          waist_inches: p.waist_inches?.toString() ?? '',
          upper_abdomen_inches: p.upper_abdomen_inches?.toString() ?? '',
          hips_inches: p.hips_inches?.toString() ?? '',
          body_age: p.body_age?.toString() ?? '',
          rmr_estimated: p.rmr_estimated?.toString() ?? '',
          activity_level: p.activity_level ?? 'moderate',
          sleep_hours: p.sleep_hours?.toString() ?? '',
          stress_level: p.stress_level?.toString() ?? '5',
          daily_budget: p.daily_budget?.toString() ?? '',
          dietary_pattern: p.dietary_pattern ?? 'eggetarian',
          meal_timing: p.meal_timing ?? '3_meals',
          eating_environment: p.eating_environment ?? 'home_cooked',
          primary_goal: p.primary_goal ?? 'recomp',
          target_bf_percent: p.target_bf_percent?.toString() ?? '',
          timeframe_weeks: p.timeframe_weeks?.toString() ?? '8',
          supplements: p.supplements ?? '',
          plan_notes: p.plan_notes ?? '',
          food_type: p.food_type ?? 'indian',
        })
      }
    } catch { setError('Failed to load profile') }
    finally { setLoading(false) }
  }

  const set = (field: keyof FormField, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }))

  const handleSave = async (regenerate = false) => {
    setSaving(true); setError(null); setSuccess(null)
    try {
      const payload = {
        name: form.name,
        age: form.age ? parseInt(form.age) : null,
        weight_kg: form.weight_kg ? parseFloat(form.weight_kg) : null,
        body_fat_percent: form.body_fat_percent ? parseFloat(form.body_fat_percent) : null,
        height_cm: form.height_cm ? parseFloat(form.height_cm) : null,
        visceral_fat: form.visceral_fat ? parseFloat(form.visceral_fat) : null,
        waist_inches: form.waist_inches ? parseFloat(form.waist_inches) : null,
        upper_abdomen_inches: form.upper_abdomen_inches ? parseFloat(form.upper_abdomen_inches) : null,
        hips_inches: form.hips_inches ? parseFloat(form.hips_inches) : null,
        body_age: form.body_age ? parseInt(form.body_age) : null,
        rmr_estimated: form.rmr_estimated ? parseFloat(form.rmr_estimated) : null,
        activity_level: form.activity_level,
        sleep_hours: form.sleep_hours ? parseFloat(form.sleep_hours) : null,
        stress_level: form.stress_level ? parseInt(form.stress_level) : null,
        daily_budget: form.daily_budget ? parseFloat(form.daily_budget) : null,
        dietary_pattern: form.dietary_pattern,
        meal_timing: form.meal_timing,
        eating_environment: form.eating_environment,
        primary_goal: form.primary_goal,
        target_bf_percent: form.target_bf_percent ? parseFloat(form.target_bf_percent) : null,
        timeframe_weeks: form.timeframe_weeks ? parseInt(form.timeframe_weeks) : null,
        supplements: form.supplements.trim() || null,
        plan_notes: form.plan_notes.trim() || null,
        food_type: form.food_type || null,
      }

      const res = await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'Failed to save profile')
      }

      if (regenerate) {
        setRegenerating(true)
        const regenRes = await fetch('/api/meal-plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes: form.plan_notes.trim() }),
        })
        setRegenerating(false)

        if (!regenRes.ok) {
          const regenData = await regenRes.json().catch(() => null)
          throw new Error(regenData?.error || 'Failed to regenerate plan')
        }
      }

      setSuccess(regenerate ? 'Profile saved and plan regenerated.' : 'Profile saved successfully.')
    } catch (err: any) {
      setError(err?.message || 'Save failed')
    } finally {
      setSaving(false)
      setRegenerating(false)
    }
  }

  const handleDeleteAccount = async () => {
    setDeleteError(null)
    setDeleteSuccess(null)

    if (!deleteEmail.trim()) {
      setDeleteError('Please enter your email address to confirm account deletion.')
      return
    }

    if (deleteEmail.trim().toLowerCase() !== userEmail.toLowerCase()) {
      setDeleteError('The email does not match your account email.')
      return
    }

    setDeleting(true)
    try {
      const res = await fetch('/api/delete-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email_confirmation: deleteEmail.trim() }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'Failed to delete account')
      }

      setDeleteSuccess('Your account has been deleted. Redirecting to login...')
      router.replace('/login')
    } catch (err: any) {
      setDeleteError(err?.message || 'Account deletion failed')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-[#0c0c10] text-white flex items-center justify-center font-mono">
      Loading profile...
    </div>
  )

  if (regenerating) return (
    <div className="min-h-screen bg-[#0c0c10] text-white flex flex-col items-center justify-center gap-4">
      <div className="text-5xl animate-pulse">🧠</div>
      <p className="text-xl font-bold font-mono">Regenerating your plan with new data…</p>
      <p className="text-gray-400 text-sm">Please wait 15–40 seconds</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#0c0c10] text-white">
      {/* Header */}
      <header className="flex items-center justify-between px-4 md:px-6 py-4 border-b border-[#222230] sticky top-0 bg-[#0c0c10] z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/dashboard')} className="text-sm text-gray-400 hover:text-yellow-500 transition-colors">
            ← Dashboard
          </button>
          <span className="text-gray-600">/</span>
          <h1 className="text-lg font-extrabold">Edit <span className="text-yellow-500">Profile</span></h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => handleSave(false)}
            disabled={saving}
            className="px-4 py-2 bg-[#17171f] border border-[#222230] text-gray-300 text-sm font-semibold rounded-full hover:border-yellow-500 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 md:px-6 py-6 space-y-5 pb-20">
        {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-red-400 text-sm font-mono">{error}</div>}
        {success && <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3 text-green-400 text-sm font-mono">{success}</div>}
        {deleteError && <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-red-400 text-sm font-mono">{deleteError}</div>}
        {deleteSuccess && <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3 text-green-400 text-sm font-mono">{deleteSuccess}</div>}

        <Section title="🧨 Delete Account">
          <div className="space-y-3">
            <p className="text-sm text-gray-400 leading-6">
              Deleting your account will remove your user record, profile data, meal plans, scans, and session history from the database.
              This action cannot be undone.
            </p>
            <p className="text-xs text-gray-500 font-mono">To confirm, type your account email exactly:</p>
            <input
              type="email"
              className={inputCls}
              value={deleteEmail}
              onChange={e => setDeleteEmail(e.target.value)}
              placeholder="you@example.com"
            />
            <button
              onClick={handleDeleteAccount}
              disabled={deleting || deleteEmail.trim().toLowerCase() !== userEmail.toLowerCase()}
              className="w-full px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-semibold transition-colors disabled:opacity-50"
            >
              {deleting ? 'Deleting account…' : 'Delete my account'}
            </button>
          </div>
        </Section>

        {/* BASIC INFO */}
        <Section title="👤 Basic Info">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Full Name">
              <input className={inputCls} value={form.name} onChange={e => set('name', e.target.value)} placeholder="Abhinav Gupta" />
            </Field>
            <Field label="Age">
              <input type="number" className={inputCls} value={form.age} onChange={e => set('age', e.target.value)} placeholder="23" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Height (cm)">
              <input type="number" step="0.1" className={inputCls} value={form.height_cm} onChange={e => set('height_cm', e.target.value)} placeholder="175" />
            </Field>
            <Field label="Weight (kg)" hint="Update weekly for accuracy">
              <input type="number" step="0.1" className={inputCls} value={form.weight_kg} onChange={e => set('weight_kg', e.target.value)} placeholder="76" />
            </Field>
          </div>
        </Section>

        {/* BODY COMPOSITION */}
        <Section title="🏋️ Body Composition">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Body Fat %" hint="From scale or tape">
              <input type="number" step="0.1" className={inputCls} value={form.body_fat_percent} onChange={e => set('body_fat_percent', e.target.value)} placeholder="18" />
            </Field>
            <Field label="Visceral Fat">
              <input type="number" step="0.1" className={inputCls} value={form.visceral_fat} onChange={e => set('visceral_fat', e.target.value)} placeholder="8" />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Waist (in)">
              <input type="number" step="0.1" className={inputCls} value={form.waist_inches} onChange={e => set('waist_inches', e.target.value)} placeholder="32" />
            </Field>
            <Field label="Abdomen (in)">
              <input type="number" step="0.1" className={inputCls} value={form.upper_abdomen_inches} onChange={e => set('upper_abdomen_inches', e.target.value)} placeholder="31" />
            </Field>
            <Field label="Hips (in)">
              <input type="number" step="0.1" className={inputCls} value={form.hips_inches} onChange={e => set('hips_inches', e.target.value)} placeholder="38" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Body Age" hint="From smart scale if available">
              <input type="number" className={inputCls} value={form.body_age} onChange={e => set('body_age', e.target.value)} placeholder="25" />
            </Field>
            <Field label="RMR (kcal)" hint="Resting metabolic rate">
              <input type="number" className={inputCls} value={form.rmr_estimated} onChange={e => set('rmr_estimated', e.target.value)} placeholder="1800" />
            </Field>
          </div>
        </Section>

        {/* GOALS */}
        <Section title="🎯 Goals">
          <Field label="Primary Goal">
            <div className="grid grid-cols-1 gap-2 mt-1">
              {GOALS.map(g => (
                <button key={g.value} type="button" onClick={() => set('primary_goal', g.value)}
                  className={`text-left px-4 py-3 rounded-xl border transition-all ${form.primary_goal === g.value ? 'border-yellow-500 bg-yellow-500/10 text-yellow-400' : 'border-[#222230] text-gray-400 hover:border-yellow-500/30'}`}>
                  <span className="font-semibold text-sm">{g.label}</span>
                  <span className="text-xs text-gray-500 block mt-0.5">{g.desc}</span>
                </button>
              ))}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Target BF%">
              <input type="number" step="0.1" className={inputCls} value={form.target_bf_percent} onChange={e => set('target_bf_percent', e.target.value)} placeholder="12" />
            </Field>
            <Field label="Timeframe (weeks)">
              <input type="number" className={inputCls} value={form.timeframe_weeks} onChange={e => set('timeframe_weeks', e.target.value)} placeholder="8" />
            </Field>
          </div>
        </Section>

        {/* LIFESTYLE */}
        <Section title="🌙 Lifestyle">
          <Field label="Activity Level">
            <div className="grid grid-cols-2 gap-2 mt-1">
              {ACTIVITY_LEVELS.map(a => (
                <button key={a.value} type="button" onClick={() => set('activity_level', a.value)}
                  className={`text-left px-3 py-2.5 rounded-xl border transition-all ${form.activity_level === a.value ? 'border-yellow-500 bg-yellow-500/10 text-yellow-400' : 'border-[#222230] text-gray-400 hover:border-yellow-500/30'}`}>
                  <span className="font-semibold text-sm">{a.label}</span>
                  <span className="text-[10px] text-gray-500 block">{a.desc}</span>
                </button>
              ))}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Sleep (hours)">
              <input type="number" step="0.5" className={inputCls} value={form.sleep_hours} onChange={e => set('sleep_hours', e.target.value)} placeholder="7.5" />
            </Field>
            <Field label="Stress Level (1–10)">
              <input type="range" min="1" max="10" className="w-full mt-2 accent-yellow-500" value={form.stress_level} onChange={e => set('stress_level', e.target.value)} />
              <div className="flex justify-between text-xs text-gray-500 mt-1"><span>Low</span><span className="text-yellow-400 font-mono font-bold">{form.stress_level}/10</span><span>High</span></div>
            </Field>
          </div>
        </Section>

        {/* DIET */}
        <Section title="🍱 Diet Preferences">
          <Field label="Dietary Pattern">
            <div className="grid grid-cols-2 gap-2 mt-1">
              {DIETARY_PATTERNS.map(d => (
                <button key={d.value} type="button" onClick={() => set('dietary_pattern', d.value)}
                  className={`px-3 py-2.5 rounded-xl border text-sm font-semibold transition-all ${form.dietary_pattern === d.value ? 'border-yellow-500 bg-yellow-500/10 text-yellow-400' : 'border-[#222230] text-gray-400 hover:border-yellow-500/30'}`}>
                  {d.label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Preferred Food Type">
            <select value={form.food_type} onChange={e => set('food_type', e.target.value)} className={inputCls}>
              <option value="indian">Indian</option>
              <option value="english">English / Western</option>
              <option value="mixed">Mixed</option>
            </select>
          </Field>
          <Field label="Meal Timing">
            <div className="grid grid-cols-2 gap-2 mt-1">
              {MEAL_TIMINGS.map(m => (
                <button key={m.value} type="button" onClick={() => set('meal_timing', m.value)}
                  className={`px-3 py-2.5 rounded-xl border text-sm font-semibold transition-all ${form.meal_timing === m.value ? 'border-yellow-500 bg-yellow-500/10 text-yellow-400' : 'border-[#222230] text-gray-400 hover:border-yellow-500/30'}`}>
                  {m.label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Daily Food Budget (₹)">
            <input type="number" className={inputCls} value={form.daily_budget} onChange={e => set('daily_budget', e.target.value)} placeholder="200" />
          </Field>
        </Section>

        <Section title="📝 Supplements & Notes">
          <Field label="Supplements (e.g. whey, multivitamins)">
            <textarea
              className={inputCls + ' min-h-[120px] resize-none'}
              value={form.supplements}
              onChange={e => set('supplements', e.target.value)}
              placeholder="List any supplements, protein powders, vitamins, or recovery aids you use."
            />
          </Field>
          <Field label="What changed this week?" hint="Add any details or feedback for the next weekly plan.">
            <textarea
              className={inputCls + ' min-h-[140px] resize-none'}
              value={form.plan_notes}
              onChange={e => set('plan_notes', e.target.value)}
              placeholder="Example: I felt low energy after lunch, I want more variety, avoid paneer, or add one cheat meal."
            />
          </Field>
        </Section>

        {/* Bottom CTAs */}
        <div className="flex flex-col gap-3 pt-2">
          <button
            onClick={() => handleSave(false)}
            disabled={saving}
            className="w-full py-4 bg-yellow-500 text-black font-extrabold text-base rounded-2xl hover:bg-yellow-400 transition-colors shadow-lg shadow-yellow-500/20 disabled:opacity-50"
          >
            {saving ? 'Saving…' : '💾 Save Changes'}
          </button>
        </div>
      </main>
    </div>
  )
}
