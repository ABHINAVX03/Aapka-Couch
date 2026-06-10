'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'

interface Scan {
  id: string
  scan_date: string
  body_fat_percent: number | null
  weight_kg: number | null
  waist_inches: number | null
  visceral_fat: number | null
}

interface Profile {
  body_fat_percent: number
  weight_kg: number
  target_bf_percent: number
  timeframe_weeks: number
  primary_goal: string
  name: string
}

function StatCard({ label, value, unit, delta, deltaLabel }: {
  label: string; value: string | number; unit: string; delta?: number | null; deltaLabel?: string
}) {
  const isGood = delta != null && delta < 0
  const isNeutral = delta == null || delta === 0
  return (
    <div className="bg-[#17171f] border border-[#222230] rounded-2xl p-4 flex flex-col gap-1">
      <p className="text-xs text-gray-500 uppercase tracking-widest font-mono">{label}</p>
      <p className="text-3xl font-extrabold text-white">
        {value}<span className="text-sm font-normal text-gray-400 ml-1">{unit}</span>
      </p>
      {delta != null && (
        <p className={`text-xs font-mono mt-1 ${isGood ? 'text-green-400' : isNeutral ? 'text-gray-500' : 'text-red-400'}`}>
          {delta > 0 ? '+' : ''}{delta.toFixed(1)} {deltaLabel}
        </p>
      )}
    </div>
  )
}

function OnTrackBadge({ profile, scans }: { profile: Profile; scans: Scan[] }) {
  if (scans.length < 2) return null

  const firstBF = scans[0].body_fat_percent
  const latestBF = scans[scans.length - 1].body_fat_percent
  if (!firstBF || !latestBF) return null

  const bfDrop = firstBF - latestBF
  const targetDrop = profile.body_fat_percent - profile.target_bf_percent
  const progress = targetDrop > 0 ? (bfDrop / targetDrop) * 100 : 0

  // Estimate weeks elapsed from first scan to now
  const firstDate = new Date(scans[0].scan_date)
  const weeksElapsed = Math.max(1, (Date.now() - firstDate.getTime()) / (7 * 24 * 3600 * 1000))
  const expectedProgress = (weeksElapsed / profile.timeframe_weeks) * 100
  const isOnTrack = progress >= expectedProgress * 0.8

  return (
    <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border ${
      isOnTrack
        ? 'bg-green-500/10 border-green-500/30 text-green-400'
        : 'bg-orange-500/10 border-orange-500/30 text-orange-400'
    }`}>
      <span>{isOnTrack ? '🎯' : '⚡'}</span>
      {isOnTrack
        ? `On track! ${bfDrop.toFixed(1)}% BF lost — keep going`
        : `${bfDrop.toFixed(1)}% BF lost — push harder this week`}
    </div>
  )
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#1a1a24] border border-[#222230] rounded-xl p-3 text-xs shadow-xl">
      <p className="text-gray-400 mb-2 font-mono">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }} className="font-semibold">
          {p.name}: {p.value?.toFixed(1)}{p.name.includes('BF') ? '%' : ' kg'}
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
  const [activeMetric, setActiveMetric] = useState<'bf' | 'weight' | 'waist'>('bf')

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
      const [scansRes, meRes] = await Promise.all([
        fetch('/api/scans'),
        fetch('/api/me'),
      ])
      if (!scansRes.ok || !meRes.ok) { router.push('/login'); return }
      const { scans } = await scansRes.json()
      const { user } = await meRes.json()
      setScans(scans || [])
      setProfile(user?.profile || null)
    } catch {
      setError('Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const addScan = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    setSuccessMsg(null)
    try {
      const res = await fetch('/api/scans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scan_date: date,
          weight_kg: weight ? parseFloat(weight) : null,
          body_fat_percent: bf ? parseFloat(bf) : null,
          waist_inches: waist ? parseFloat(waist) : null,
          visceral_fat: vf ? parseFloat(vf) : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to save scan'); return }
      setWeight(''); setBf(''); setWaist(''); setVf('')
      setDate(new Date().toISOString().split('T')[0])
      setSuccessMsg('✅ Scan saved successfully!')
      setShowForm(false)
      await fetchData()
    } catch {
      setError('An error occurred. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // Chart data
  const chartData = scans.map(s => ({
    date: new Date(s.scan_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
    bf: s.body_fat_percent,
    weight: s.weight_kg,
    waist: s.waist_inches,
  }))

  // Stats
  const latest = scans[scans.length - 1]
  const first = scans[0]
  const bfDelta = (latest && first && latest.body_fat_percent != null && first.body_fat_percent != null)
    ? latest.body_fat_percent - first.body_fat_percent : null
  const weightDelta = (latest && first && latest.weight_kg != null && first.weight_kg != null)
    ? latest.weight_kg - first.weight_kg : null
  const waistDelta = (latest && first && latest.waist_inches != null && first.waist_inches != null)
    ? latest.waist_inches - first.waist_inches : null

  const metricConfig = {
    bf: { key: 'bf', color: '#f4a623', name: 'BF %', target: profile?.target_bf_percent },
    weight: { key: 'weight', color: '#60a5fa', name: 'Weight (kg)', target: undefined },
    waist: { key: 'waist', color: '#c084fc', name: 'Waist (in)', target: undefined },
  }
  const mc = metricConfig[activeMetric]

  if (loading) return (
    <div className="min-h-screen bg-[#0c0c10] text-white flex items-center justify-center font-mono">
      Loading progress data...
    </div>
  )

  return (
    <div className="min-h-screen bg-[#0c0c10] text-white">
      {/* Header */}
      <header className="flex items-center justify-between px-4 md:px-6 py-4 border-b border-[#222230]">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/dashboard')}
            className="text-sm text-gray-400 hover:text-yellow-500 transition-colors flex items-center gap-1"
          >
            ← Dashboard
          </button>
          <span className="text-gray-600">/</span>
          <h1 className="text-lg font-extrabold">
            Progress<span className="text-yellow-500"> Tracker</span>
          </h1>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="px-4 py-2 bg-yellow-500 text-black font-bold text-sm rounded-full hover:bg-yellow-400 transition-colors"
        >
          {showForm ? 'Cancel' : '+ Log Scan'}
        </button>
      </header>

      <main className="max-w-4xl mx-auto px-4 md:px-6 py-6 space-y-6">

        {/* Success message */}
        {successMsg && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3 text-green-400 text-sm font-mono">
            {successMsg}
          </div>
        )}

        {/* On-track badge */}
        {profile && scans.length >= 2 && (
          <OnTrackBadge profile={profile} scans={scans} />
        )}

        {/* Stats row */}
        {scans.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              label="Body Fat"
              value={latest.body_fat_percent?.toFixed(1) ?? '—'}
              unit="%"
              delta={bfDelta}
              deltaLabel="% from start"
            />
            <StatCard
              label="Weight"
              value={latest.weight_kg?.toFixed(1) ?? '—'}
              unit="kg"
              delta={weightDelta}
              deltaLabel="kg from start"
            />
            <StatCard
              label="Waist"
              value={latest.waist_inches?.toFixed(1) ?? '—'}
              unit="in"
              delta={waistDelta}
              deltaLabel="in from start"
            />
            <StatCard
              label="Scans Logged"
              value={scans.length}
              unit="total"
            />
          </div>
        ) : (
          <div className="bg-[#17171f] border border-dashed border-[#222230] rounded-2xl p-8 text-center">
            <div className="text-4xl mb-3">📊</div>
            <p className="text-gray-400 text-sm leading-relaxed">
              No scans logged yet. Log your first body scan to start tracking your progress.
            </p>
          </div>
        )}

        {/* Chart */}
        {chartData.length >= 2 && (
          <div className="bg-[#17171f] border border-[#222230] rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-white">Progress Chart</h2>
              <div className="flex gap-2">
                {(['bf', 'weight', 'waist'] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => setActiveMetric(m)}
                    className={`text-xs px-3 py-1.5 rounded-full font-mono transition-all border ${
                      activeMetric === m
                        ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400'
                        : 'border-[#222230] text-gray-500 hover:text-white'
                    }`}
                  >
                    {m === 'bf' ? 'BF %' : m === 'weight' ? 'Weight' : 'Waist'}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#222230" />
                <XAxis dataKey="date" stroke="#6b6b7e" fontSize={11} tick={{ fill: '#6b6b7e' }} />
                <YAxis stroke="#6b6b7e" fontSize={11} tick={{ fill: '#6b6b7e' }} domain={['auto', 'auto']} />
                <Tooltip content={<CustomTooltip />} />
                {mc.target != null && (
                  <ReferenceLine
                    y={mc.target}
                    stroke={mc.color}
                    strokeDasharray="6 3"
                    strokeOpacity={0.5}
                    label={{ value: `Target ${mc.target}%`, fill: mc.color, fontSize: 10, position: 'right' }}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey={mc.key}
                  stroke={mc.color}
                  strokeWidth={2.5}
                  dot={{ fill: mc.color, r: 4, strokeWidth: 0 }}
                  activeDot={{ r: 6, fill: mc.color }}
                  name={mc.name}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Log new scan form */}
        {showForm && (
          <div className="bg-[#17171f] border border-yellow-500/20 rounded-2xl p-5 shadow-xl">
            <h2 className="text-lg font-bold mb-4 text-yellow-500">Log New Scan</h2>
            {error && <p className="text-red-400 text-sm mb-4 font-mono">{error}</p>}
            <form onSubmit={addScan} className="space-y-4">
              <div>
                <label className="text-xs text-gray-400 font-mono uppercase tracking-wider">Scan Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="w-full mt-1 p-3 bg-[#0c0c10] border border-[#222230] rounded-xl text-white focus:border-yellow-500 outline-none transition-colors"
                  required
                  disabled={submitting}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 font-mono uppercase tracking-wider">Weight (kg)</label>
                  <input
                    type="number" step="0.1" value={weight}
                    onChange={e => setWeight(e.target.value)}
                    placeholder={profile?.weight_kg?.toString() ?? '74.5'}
                    className="w-full mt-1 p-3 bg-[#0c0c10] border border-[#222230] rounded-xl text-white focus:border-yellow-500 outline-none transition-colors"
                    disabled={submitting}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 font-mono uppercase tracking-wider">Body Fat %</label>
                  <input
                    type="number" step="0.1" value={bf}
                    onChange={e => setBf(e.target.value)}
                    placeholder={profile?.body_fat_percent?.toString() ?? '16.5'}
                    className="w-full mt-1 p-3 bg-[#0c0c10] border border-[#222230] rounded-xl text-white focus:border-yellow-500 outline-none transition-colors"
                    disabled={submitting}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 font-mono uppercase tracking-wider">Waist (in)</label>
                  <input
                    type="number" step="0.1" value={waist}
                    onChange={e => setWaist(e.target.value)}
                    placeholder="32.0"
                    className="w-full mt-1 p-3 bg-[#0c0c10] border border-[#222230] rounded-xl text-white focus:border-yellow-500 outline-none transition-colors"
                    disabled={submitting}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 font-mono uppercase tracking-wider">Visceral Fat</label>
                  <input
                    type="number" step="0.1" value={vf}
                    onChange={e => setVf(e.target.value)}
                    placeholder="8.0"
                    className="w-full mt-1 p-3 bg-[#0c0c10] border border-[#222230] rounded-xl text-white focus:border-yellow-500 outline-none transition-colors"
                    disabled={submitting}
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full py-3 bg-yellow-500 text-black font-extrabold rounded-xl hover:bg-yellow-400 transition-colors disabled:opacity-50"
                disabled={submitting}
              >
                {submitting ? 'Saving...' : 'Save Scan'}
              </button>
            </form>
          </div>
        )}

        {/* Scan history table */}
        {scans.length > 0 && (
          <div className="bg-[#17171f] border border-[#222230] rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#222230]">
              <h2 className="font-bold text-white">Scan History</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 uppercase tracking-wider font-mono border-b border-[#222230]">
                    <th className="text-left px-5 py-3">Date</th>
                    <th className="text-right px-5 py-3">Weight</th>
                    <th className="text-right px-5 py-3">BF %</th>
                    <th className="text-right px-5 py-3">Waist</th>
                    <th className="text-right px-5 py-3">Visceral</th>
                  </tr>
                </thead>
                <tbody>
                  {[...scans].reverse().map((scan, i) => (
                    <tr key={scan.id} className={`border-b border-[#222230]/50 hover:bg-white/[0.02] transition-colors ${i === 0 ? 'bg-yellow-500/5' : ''}`}>
                      <td className="px-5 py-3 font-mono text-gray-300 text-xs">
                        {new Date(scan.scan_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        {i === 0 && <span className="ml-2 text-[10px] text-yellow-500 bg-yellow-500/10 px-1.5 py-0.5 rounded font-bold">LATEST</span>}
                      </td>
                      <td className="px-5 py-3 text-right font-mono">{scan.weight_kg != null ? `${scan.weight_kg} kg` : '—'}</td>
                      <td className="px-5 py-3 text-right font-mono text-blue-400">{scan.body_fat_percent != null ? `${scan.body_fat_percent}%` : '—'}</td>
                      <td className="px-5 py-3 text-right font-mono">{scan.waist_inches != null ? `${scan.waist_inches}"` : '—'}</td>
                      <td className="px-5 py-3 text-right font-mono">{scan.visceral_fat != null ? scan.visceral_fat : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}