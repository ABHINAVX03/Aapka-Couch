'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

interface Scan { id: string; scan_date: string; body_fat_percent: number | null; weight_kg: number | null; waist_inches: number | null; visceral_fat: number | null; }
interface Profile { body_fat_percent: number; weight_kg: number; target_bf_percent: number; timeframe_weeks: number; primary_goal: string; name: string; }

function StatCard({ label, value, unit, delta, deltaLabel }: any) {
  const isGood = delta != null && delta < 0
  const isNeutral = delta == null || delta === 0
  return (
    <div className="bg-[#17171f] border border-[#222230] rounded-2xl p-5 flex flex-col gap-1 transition-all hover:border-yellow-500/30">
      <p className="text-xs text-gray-500 uppercase tracking-widest font-mono">{label}</p>
      <p className="text-3xl font-extrabold text-white">
        {value}<span className="text-sm font-normal text-gray-400 ml-1">{unit}</span>
      </p>
      {delta != null && (
        <p className={`text-xs font-mono mt-2 flex items-center gap-1 ${isGood ? 'text-green-400' : isNeutral ? 'text-gray-500' : 'text-red-400'}`}>
          <span className={`px-1.5 py-0.5 rounded-md ${isGood ? 'bg-green-400/10' : isNeutral ? 'bg-gray-500/10' : 'bg-red-400/10'}`}>
            {delta > 0 ? '↑' : delta < 0 ? '↓' : ''} {Math.abs(delta).toFixed(1)}
          </span>
          <span className="text-gray-500">{deltaLabel}</span>
        </p>
      )}
    </div>
  )
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#0c0c10]/90 backdrop-blur-md border border-[#222230] rounded-xl p-4 shadow-2xl">
      <p className="text-gray-400 mb-2 font-mono text-xs uppercase tracking-wider border-b border-[#222230] pb-2">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }} className="font-bold text-lg">
          {p.name}: {p.value?.toFixed(1)}{p.name.includes('BF') ? '%' : p.name.includes('Waist') ? '"' : ' kg'}
        </p>
      ))}
    </div>
  )
}

export default function ProgressPage() {
  const router = useRouter()
  const [scans, setScans] = useState<Scan[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeMetric, setActiveMetric] = useState<'bf' | 'weight' | 'waist'>('weight')

  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [weight, setWeight] = useState('')
  const [bf, setBf] = useState('')
  const [waist, setWaist] = useState('')
  const [vf, setVf] = useState('')
  
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [scansRes, meRes] = await Promise.all([fetch('/api/scans'), fetch('/api/me')])
      if (!scansRes.ok || !meRes.ok) { router.push('/login'); return }
      const { scans } = await scansRes.json()
      const { user } = await meRes.json()
      setScans(scans || [])
      setProfile(user?.profile || null)
      if (scans && scans.length > 0 && scans[0].body_fat_percent) setActiveMetric('bf')
    } catch { setError('Failed to load data') } 
    finally { setLoading(false) }
  }

  const addScan = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true); setError(null); setSuccessMsg(null)
    try {
      const res = await fetch('/api/scans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scan_date: date, weight_kg: weight ? parseFloat(weight) : null,
          body_fat_percent: bf ? parseFloat(bf) : null, waist_inches: waist ? parseFloat(waist) : null,
          visceral_fat: vf ? parseFloat(vf) : null,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to save scan')
      
      setWeight(''); setBf(''); setWaist(''); setVf(''); setShowForm(false)
      setSuccessMsg('✅ Scan saved successfully!')
      setTimeout(() => setSuccessMsg(null), 3000)
      await fetchData()
    } catch (err: any) { setError(err.message || 'Error saving scan.') } 
    finally { setSubmitting(false) }
  }

  const chartData = scans.map(s => ({
    date: new Date(s.scan_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
    bf: s.body_fat_percent, weight: s.weight_kg, waist: s.waist_inches,
  }))

  const latest = scans[scans.length - 1]
  const first = scans[0]
  const bfDelta = (latest?.body_fat_percent && first?.body_fat_percent) ? latest.body_fat_percent - first.body_fat_percent : null
  const weightDelta = (latest?.weight_kg && first?.weight_kg) ? latest.weight_kg - first.weight_kg : null
  const waistDelta = (latest?.waist_inches && first?.waist_inches) ? latest.waist_inches - first.waist_inches : null

  const metricConfig = {
    bf: { key: 'bf', color: '#eab308', name: 'Body Fat %', target: profile?.target_bf_percent },
    weight: { key: 'weight', color: '#3b82f6', name: 'Weight (kg)', target: undefined },
    waist: { key: 'waist', color: '#a855f7', name: 'Waist (in)', target: undefined },
  }
  const mc = metricConfig[activeMetric]

  if (loading) return <div className="min-h-screen bg-[#0c0c10] text-yellow-500 flex items-center justify-center font-mono">Loading telemetry...</div>

  return (
    <div className="min-h-screen bg-[#0c0c10] text-white pb-20">
      <header className="flex items-center justify-between px-4 md:px-6 py-4 border-b border-[#222230] sticky top-0 bg-[#0c0c10]/90 backdrop-blur-xl z-20">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/dashboard')} className="text-sm text-gray-400 hover:text-yellow-500 transition-colors">← Dashboard</button>
          <span className="text-gray-600">/</span>
          <h1 className="text-lg font-extrabold">Progress<span className="text-yellow-500"> Tracker</span></h1>
        </div>
        <button onClick={() => setShowForm(!showForm)} className={`px-4 py-2 font-bold text-sm rounded-full transition-all ${showForm ? 'bg-[#17171f] text-white border border-[#222230]' : 'bg-yellow-500 text-black hover:bg-yellow-400 shadow-[0_0_15px_rgba(234,179,8,0.2)]'}`}>
          {showForm ? 'Cancel' : '+ Log Weekly Scan'}
        </button>
      </header>

      <main className="max-w-4xl mx-auto px-4 md:px-6 py-8 space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-500">
        {successMsg && <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 text-green-400 text-sm font-mono text-center">{successMsg}</div>}

        {/* LOG NEW SCAN FORM */}
        {showForm && (
          <div className="bg-[#121218] border border-yellow-500/50 rounded-3xl p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <h2 className="text-xl font-bold mb-6 text-yellow-500 flex items-center gap-2"><span>📏</span> Log Body Metrics</h2>
            {error && <p className="text-red-400 text-sm mb-4 font-mono bg-red-500/10 p-3 rounded-lg">{error}</p>}
            <form onSubmit={addScan} className="space-y-5">
              <div>
                <label className="text-xs text-gray-400 font-mono uppercase tracking-wider">Scan Date</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full mt-1.5 p-3.5 bg-[#0c0c10] border border-[#222230] rounded-xl text-white focus:border-yellow-500 outline-none" required disabled={submitting} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-400 font-mono uppercase tracking-wider">Weight (kg)</label>
                  <input type="number" step="0.1" value={weight} onChange={e => setWeight(e.target.value)} placeholder={profile?.weight_kg?.toString() ?? '74.5'} className="w-full mt-1.5 p-3.5 bg-[#0c0c10] border border-[#222230] rounded-xl text-white focus:border-yellow-500 outline-none" disabled={submitting} />
                </div>
                <div>
                  <label className="text-xs text-gray-400 font-mono uppercase tracking-wider">Body Fat %</label>
                  <input type="number" step="0.1" value={bf} onChange={e => setBf(e.target.value)} placeholder={profile?.body_fat_percent?.toString() ?? '16.5'} className="w-full mt-1.5 p-3.5 bg-[#0c0c10] border border-[#222230] rounded-xl text-white focus:border-yellow-500 outline-none" disabled={submitting} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-400 font-mono uppercase tracking-wider">Waist (in)</label>
                  <input type="number" step="0.1" value={waist} onChange={e => setWaist(e.target.value)} placeholder="32.0" className="w-full mt-1.5 p-3.5 bg-[#0c0c10] border border-[#222230] rounded-xl text-white focus:border-yellow-500 outline-none" disabled={submitting} />
                </div>
                <div>
                  <label className="text-xs text-gray-400 font-mono uppercase tracking-wider">Visceral Fat</label>
                  <input type="number" step="0.1" value={vf} onChange={e => setVf(e.target.value)} placeholder="8.0" className="w-full mt-1.5 p-3.5 bg-[#0c0c10] border border-[#222230] rounded-xl text-white focus:border-yellow-500 outline-none" disabled={submitting} />
                </div>
              </div>
              <button type="submit" disabled={submitting} className="w-full py-4 bg-yellow-500 text-black font-extrabold text-lg rounded-xl hover:bg-yellow-400 transition-all shadow-[0_0_15px_rgba(234,179,8,0.3)] disabled:opacity-50 mt-2">
                {submitting ? 'Saving to Vault...' : 'Save Scan Data'}
              </button>
            </form>
          </div>
        )}

        {/* STATS GRID */}
        {scans.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Body Fat" value={latest.body_fat_percent?.toFixed(1) ?? '—'} unit="%" delta={bfDelta} deltaLabel="since start" />
            <StatCard label="Weight" value={latest.weight_kg?.toFixed(1) ?? '—'} unit="kg" delta={weightDelta} deltaLabel="since start" />
            <StatCard label="Waist" value={latest.waist_inches?.toFixed(1) ?? '—'} unit="in" delta={waistDelta} deltaLabel="since start" />
            <StatCard label="Total Scans" value={scans.length} unit="logs" />
          </div>
        ) : (
          <div className="bg-[#17171f] border border-dashed border-[#222230] rounded-3xl p-12 text-center">
            <div className="text-5xl mb-4 opacity-50">📊</div>
            <h3 className="text-xl font-bold text-white mb-2">No Data Yet</h3>
            <p className="text-gray-400 text-sm leading-relaxed max-w-sm mx-auto">Log your first body scan to unlock intelligent charts and see your recomp progress over time.</p>
          </div>
        )}

        {/* CHART */}
        {chartData.length >= 2 && (
          <div className="bg-[#17171f] border border-[#222230] rounded-3xl p-6 shadow-xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
              <h2 className="font-bold text-white text-lg flex items-center gap-2"><span>📈</span> Trajectory</h2>
              <div className="flex bg-[#0c0c10] p-1 rounded-xl border border-[#222230]">
                {(['weight', 'bf', 'waist'] as const).map(m => (
                  <button key={m} onClick={() => setActiveMetric(m)} className={`text-xs px-4 py-2 rounded-lg font-bold transition-all ${activeMetric === m ? 'bg-[#222230] text-white shadow-md' : 'text-gray-500 hover:text-gray-300'}`}>
                    {m === 'bf' ? 'Body Fat %' : m === 'weight' ? 'Weight' : 'Waist'}
                  </button>
                ))}
              </div>
            </div>
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#222230" vertical={false} />
                  <XAxis dataKey="date" stroke="#6b6b7e" fontSize={10} tick={{ fill: '#6b6b7e' }} tickMargin={10} axisLine={false} tickLine={false} />
                  <YAxis stroke="#6b6b7e" fontSize={10} tick={{ fill: '#6b6b7e' }} domain={['auto', 'auto']} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#222230', strokeWidth: 2 }} />
                  {mc.target != null && (
                    <ReferenceLine y={mc.target} stroke={mc.color} strokeDasharray="6 4" strokeOpacity={0.4} label={{ value: `Goal: ${mc.target}`, fill: mc.color, fontSize: 10, position: 'insideTopRight' }} />
                  )}
                  <Line type="monotone" dataKey={mc.key} stroke={mc.color} strokeWidth={3} dot={{ fill: '#0c0c10', stroke: mc.color, strokeWidth: 2, r: 5 }} activeDot={{ r: 8, fill: mc.color, stroke: '#0c0c10', strokeWidth: 3 }} name={mc.name} animationDuration={1000} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}