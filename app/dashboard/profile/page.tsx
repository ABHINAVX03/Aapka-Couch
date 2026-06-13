'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

// ─────────────────────────────────────────────
// DATA CONSTANTS
// ─────────────────────────────────────────────
const ACTIVITY_LEVELS = [
  { id: 'sedentary', title: 'Sedentary', desc: 'Office job, mostly sitting' },
  { id: 'light', title: 'Light', desc: '1–3 days/week light exercise' },
  { id: 'moderate', title: 'Moderate', desc: '3–5 days/week training' },
  { id: 'heavy', title: 'Heavy', desc: '6–7 days/week intense training' },
]

const GOALS = [
  { id: 'fat_loss', icon: '🔥', title: 'Fat Loss', desc: 'Aggressive deficit' },
  { id: 'recomp', icon: '⚡', title: 'Recomposition', desc: 'Lose fat, build muscle' },
  { id: 'muscle_gain', icon: '💪', title: 'Muscle Gain', desc: 'Caloric surplus' },
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

const FOOD_TYPES = [
  { id: 'indian', title: 'Indian Foods' },
  { id: 'english', title: 'Western / English Foods' },
  { id: 'mixed', title: 'Mixed' },
]

// ─────────────────────────────────────────────
// STABLE UI COMPONENTS
// ─────────────────────────────────────────────
const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="bg-[#121218] border border-[#222230] rounded-3xl p-6 space-y-6 shadow-lg">
    <h2 className="font-bold text-yellow-500 font-mono uppercase tracking-widest text-sm border-b border-[#222230] pb-3">{title}</h2>
    {children}
  </div>
)

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

const InputField = ({ label, value, onChange, placeholder, type = "text", step, hint }: any) => (
  <div className="w-full">
    <label className="block text-xs font-mono uppercase tracking-wider text-gray-400 mb-1.5">{label}</label>
    <input type={type} step={step} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="w-full p-3.5 bg-[#17171f] border border-[#222230] rounded-xl text-white focus:border-yellow-500 outline-none transition-all focus:ring-4 focus:ring-yellow-500/10 placeholder-gray-600" />
    {hint && <p className="text-[10px] text-gray-500 mt-1.5 leading-relaxed">{hint}</p>}
  </div>
)

interface FormField {
  name: string; age: string; sex: string; weight_kg: string; body_fat_percent: string;
  height_cm: string; visceral_fat: string; waist_inches: string; upper_abdomen_inches: string;
  hips_inches: string; body_age: string; rmr_estimated: string; activity_level: string;
  sleep_hours: string; stress_level: string; dietary_pattern: string; meal_timing: string;
  eating_environment: string; primary_goal: string; target_bf_percent: string;
  timeframe_weeks: string; supplements: string; plan_notes: string; food_type: string;
}

// ─────────────────────────────────────────────
// MAIN PAGE COMPONENT
// ─────────────────────────────────────────────
export default function ProfileEditPage() {
  const router = useRouter()
  const [form, setForm] = useState<FormField>({
    name: '', age: '', sex: 'male', weight_kg: '', body_fat_percent: '', height_cm: '',
    visceral_fat: '', waist_inches: '', upper_abdomen_inches: '', hips_inches: '',
    body_age: '', rmr_estimated: '', activity_level: 'moderate', sleep_hours: '',
    stress_level: '5', dietary_pattern: 'eggetarian', meal_timing: '4_meals', 
    eating_environment: 'home_cooked', primary_goal: 'recomp', target_bf_percent: '', 
    timeframe_weeks: '8', supplements: '', plan_notes: '', food_type: 'indian',
  })
  
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
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
          name: p.name ?? '', age: p.age?.toString() ?? '', sex: p.sex ?? 'male',
          weight_kg: p.weight_kg?.toString() ?? '', body_fat_percent: p.body_fat_percent?.toString() ?? '',
          height_cm: p.height_cm?.toString() ?? '', visceral_fat: p.visceral_fat?.toString() ?? '',
          waist_inches: p.waist_inches?.toString() ?? '', upper_abdomen_inches: p.upper_abdomen_inches?.toString() ?? '',
          hips_inches: p.hips_inches?.toString() ?? '', body_age: p.body_age?.toString() ?? '',
          rmr_estimated: p.rmr_estimated?.toString() ?? '', activity_level: p.activity_level ?? 'moderate',
          sleep_hours: p.sleep_hours?.toString() ?? '', stress_level: p.stress_level?.toString() ?? '5',
          dietary_pattern: p.dietary_pattern ?? 'eggetarian', meal_timing: p.meal_timing ?? '4_meals',
          eating_environment: p.eating_environment ?? 'home_cooked', primary_goal: p.primary_goal ?? 'recomp',
          target_bf_percent: p.target_bf_percent?.toString() ?? '', timeframe_weeks: p.timeframe_weeks?.toString() ?? '8',
          supplements: p.supplements ?? '', plan_notes: p.plan_notes ?? '', food_type: p.food_type ?? 'indian',
        })
      }
    } catch { setError('Failed to load profile') }
    finally { setLoading(false) }
  }

  const setField = (field: keyof FormField, value: string) => {
    setError(null); setSuccess(null);
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const handleSave = async () => {
    setSaving(true); setError(null); setSuccess(null);

    try {
      const payload = {
        name: form.name, sex: form.sex,
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

      setSuccess('✅ Profile saved! Return to the Dashboard when you are ready to generate your next week.')
      // 🟢 AUTO-SCROLL TO TOP ON SUCCESS
      window.scrollTo({ top: 0, behavior: 'smooth' });

    } catch (err: any) {
      setError(err?.message || 'Save failed')
      // 🟢 AUTO-SCROLL TO TOP ON ERROR
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteAccount = async () => {
    setDeleteError(null); setDeleteSuccess(null);
    if (!deleteEmail.trim() || deleteEmail.trim().toLowerCase() !== userEmail.toLowerCase()) {
      setDeleteError('The email does not match your account email.'); return;
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
      setDeleteSuccess('Your account has been deleted. Redirecting...')
      setTimeout(() => router.replace('/login'), 1500)
    } catch (err: any) {
      setDeleteError(err?.message || 'Account deletion failed')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) return <div className="min-h-screen bg-[#0c0c10] text-white flex items-center justify-center font-mono">Loading profile...</div>

  return (
    <div className="min-h-screen bg-[#0c0c10] text-white pb-32">
      {/* Header */}
      <header className="flex items-center justify-between px-4 md:px-6 py-4 border-b border-[#222230] sticky top-0 bg-[#0c0c10]/90 backdrop-blur-xl z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/dashboard')} className="text-sm text-gray-400 hover:text-yellow-500 transition-colors">
            ← Dashboard
          </button>
          <span className="text-gray-600">/</span>
          <h1 className="text-lg font-extrabold">Settings & <span className="text-yellow-500">Profile</span></h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 md:px-6 py-8 space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-500">
        
        {/* Global status messages */}
        {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm font-mono text-center shadow-lg">{error}</div>}
        {success && <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 text-green-400 text-sm font-mono text-center shadow-lg">{success}</div>}

        {/* BASIC INFO */}
        <Section title="👤 Basic Info">
          <InputField label="Full Name" value={form.name} onChange={(v:any) => setField('name', v)} placeholder="e.g. Abhinav Gupta" />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-gray-400 mb-1.5">Sex</label>
              <div className="flex gap-2 bg-[#17171f] p-1.5 rounded-xl border border-[#222230]">
                <button type="button" onClick={() => setField('sex', 'male')} className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${form.sex === 'male' ? 'bg-yellow-500 text-black shadow-md' : 'text-gray-400 hover:text-white'}`}>Male</button>
                <button type="button" onClick={() => setField('sex', 'female')} className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${form.sex === 'female' ? 'bg-yellow-500 text-black shadow-md' : 'text-gray-400 hover:text-white'}`}>Female</button>
              </div>
            </div>
            <InputField label="Age" type="number" value={form.age} onChange={(v:any) => setField('age', v)} placeholder="23" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <InputField label="Height (cm)" type="number" step="0.1" value={form.height_cm} onChange={(v:any) => setField('height_cm', v)} placeholder="175" />
            <InputField label="Weight (kg)" hint="Update weekly for accurate macros" type="number" step="0.1" value={form.weight_kg} onChange={(v:any) => setField('weight_kg', v)} placeholder="76" />
          </div>
        </Section>

        {/* BODY COMPOSITION */}
        <Section title="🏋️ Body Composition (Optional)">
          <div className="grid grid-cols-2 gap-4">
            <InputField label="Body Fat %" type="number" step="0.1" value={form.body_fat_percent} onChange={(v:any) => setField('body_fat_percent', v)} placeholder="18" />
            <InputField label="Visceral Fat" type="number" step="0.1" value={form.visceral_fat} onChange={(v:any) => setField('visceral_fat', v)} placeholder="8" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <InputField label="Waist (in)" type="number" step="0.1" value={form.waist_inches} onChange={(v:any) => setField('waist_inches', v)} placeholder="32" />
            <InputField label="Abdomen (in)" type="number" step="0.1" value={form.upper_abdomen_inches} onChange={(v:any) => setField('upper_abdomen_inches', v)} placeholder="31" />
            <InputField label="Hips (in)" type="number" step="0.1" value={form.hips_inches} onChange={(v:any) => setField('hips_inches', v)} placeholder="38" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <InputField label="Body Age" type="number" value={form.body_age} onChange={(v:any) => setField('body_age', v)} placeholder="25" />
            <InputField label="RMR (kcal)" type="number" value={form.rmr_estimated} onChange={(v:any) => setField('rmr_estimated', v)} placeholder="1800" />
          </div>
        </Section>

        {/* GOALS */}
        <Section title="🎯 Goal & Timeframe">
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-gray-400 mb-3">Primary Goal</label>
            <div className="grid grid-cols-1 gap-3">
              {GOALS.map(g => (
                <SelectCard key={g.id} active={form.primary_goal === g.id} title={g.title} desc={g.desc} icon={g.icon} onClick={() => setField('primary_goal', g.id)} />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 pt-2">
            <InputField label="Target BF%" type="number" step="0.1" value={form.target_bf_percent} onChange={(v:any) => setField('target_bf_percent', v)} placeholder="12" />
            <InputField label="Timeframe (weeks)" type="number" value={form.timeframe_weeks} onChange={(v:any) => setField('timeframe_weeks', v)} placeholder="8" />
          </div>
        </Section>

        {/* LIFESTYLE */}
        <Section title="🌙 Daily Lifestyle">
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-gray-400 mb-3">Activity Level</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {ACTIVITY_LEVELS.map(a => (
                <SelectCard key={a.id} active={form.activity_level === a.id} title={a.title} desc={a.desc} onClick={() => setField('activity_level', a.id)} />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-6 pt-2">
            <InputField label="Sleep (hours)" type="number" step="0.5" value={form.sleep_hours} onChange={(v:any) => setField('sleep_hours', v)} placeholder="7.5" />
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-gray-400 mb-1.5">Stress (1-10)</label>
              <div className="bg-[#17171f] border border-[#222230] p-3.5 rounded-xl flex items-center gap-4">
                <input type="range" min="1" max="10" value={form.stress_level} onChange={e => setField('stress_level', e.target.value)} className="w-full accent-yellow-500" />
                <span className="font-bold font-mono text-yellow-500">{form.stress_level}</span>
              </div>
            </div>
          </div>
        </Section>

        {/* DIET */}
        <Section title="🍱 Diet Preferences">
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-gray-400 mb-3">Dietary Pattern</label>
            <div className="grid grid-cols-2 gap-3">
              {DIETS.map(d => (
                <SelectCard key={d.id} active={form.dietary_pattern === d.id} title={d.title} desc={d.desc} onClick={() => setField('dietary_pattern', d.id)} />
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-gray-400 mb-3">Food Origin Preference</label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {FOOD_TYPES.map(f => (
                <SelectCard key={f.id} active={form.food_type === f.id} title={f.title} onClick={() => setField('food_type', f.id)} />
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-gray-400 mb-3">Eating Environment</label>
            <div className="grid grid-cols-2 gap-3">
              {ENVIRONMENTS.map(e => (
                <SelectCard key={e.id} active={form.eating_environment === e.id} title={e.title} icon={e.icon} onClick={() => setField('eating_environment', e.id)} />
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-gray-400 mb-3">Meal Timing / Fasting</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {TIMINGS.map(t => (
                <SelectCard key={t.id} active={form.meal_timing === t.id} title={t.title} desc={t.desc} onClick={() => setField('meal_timing', t.id)} />
              ))}
            </div>
          </div>
        </Section>

        {/* NOTES & SUPPLEMENTS */}
        <Section title="📝 Supplements & Notes">
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-gray-400 mb-1.5">Supplements (e.g. whey, vitamins)</label>
            <textarea
              className="w-full p-4 bg-[#17171f] border border-[#222230] rounded-xl text-white outline-none focus:border-yellow-500 min-h-[100px] resize-none text-sm"
              value={form.supplements}
              onChange={e => setField('supplements', e.target.value)}
              placeholder="List any supplements, protein powders, vitamins, or recovery aids you use."
            />
          </div>
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-gray-400 mb-1.5">Feedback for next week's plan</label>
            <textarea
              className="w-full p-4 bg-[#17171f] border border-[#222230] rounded-xl text-white outline-none focus:border-yellow-500 min-h-[100px] resize-none text-sm"
              value={form.plan_notes}
              onChange={e => setField('plan_notes', e.target.value)}
              placeholder="Example: I felt low energy after lunch, I want more variety, avoid paneer..."
            />
            <p className="text-[10px] text-gray-500 mt-2 leading-relaxed">This feedback will be automatically applied the next time you generate a plan from your Dashboard.</p>
          </div>
        </Section>

        <Section title="🗑️ Danger Zone">
          <div className="space-y-4">
            <p className="text-sm text-gray-400 leading-relaxed">
              Deleting your account will permanently wipe your profile data, active meal plans, body scans, and session history from the database.
            </p>
            <InputField label="Type your email to confirm" type="email" value={deleteEmail} onChange={setDeleteEmail} placeholder="you@example.com" />
            
            {deleteError && <p className="text-red-400 text-xs font-mono">{deleteError}</p>}
            {deleteSuccess && <p className="text-green-400 text-xs font-mono">{deleteSuccess}</p>}
            
            <button
              onClick={handleDeleteAccount}
              disabled={deleting || deleteEmail.trim().toLowerCase() !== userEmail.toLowerCase()}
              className="w-full px-4 py-3 bg-red-500/10 border border-red-500/30 text-red-500 rounded-xl font-bold transition-all hover:bg-red-500/20 disabled:opacity-40 disabled:hover:bg-red-500/10"
            >
              {deleting ? 'Deleting account…' : 'Delete my account permanently'}
            </button>
          </div>
        </Section>
      </main>

      {/* Floating Save Bar */}
      <div className="fixed bottom-0 left-0 w-full bg-[#0c0c10]/90 backdrop-blur-xl border-t border-[#222230] p-4 z-40">
        <div className="max-w-2xl mx-auto">
          <button
            onClick={() => handleSave()}
            disabled={saving}
            className="w-full py-3.5 bg-yellow-500 text-black font-extrabold text-base rounded-xl hover:bg-yellow-400 transition-all shadow-[0_0_15px_rgba(234,179,8,0.3)] disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <span className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin"></span> : '💾 Save Profile Settings'}
          </button>
        </div>
      </div>

    </div>
  )
}