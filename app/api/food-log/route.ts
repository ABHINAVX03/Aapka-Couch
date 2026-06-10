import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import { hashToken } from '@/lib/otp'

async function getSession() {
  const cookieStore = await cookies()
  const authToken = cookieStore.get('auth-token')?.value
  if (!authToken) return null

  const tokenHash = hashToken(authToken)
  const { data: session } = await supabaseAdmin
    .from('sessions')
    .select('user_id')
    .eq('token_hash', tokenHash)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  return session
}

// GET /api/food-log?date=YYYY-MM-DD
// Returns all meal log entries for the given date (defaults to today)
export async function GET(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not logged in' }, { status: 401 })

    const url = new URL(req.url)
    const date = url.searchParams.get('date') ?? new Date().toISOString().split('T')[0]

    // Also fetch the last 7 days for streak calculation
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
    const since = sevenDaysAgo.toISOString().split('T')[0]

    const { data: logs, error } = await supabaseAdmin
      .from('food_logs')
      .select('*')
      .eq('user_id', session.user_id)
      .gte('plan_date', since)
      .order('plan_date', { ascending: false })

    if (error) {
      console.error('Food log fetch error:', error)
      return NextResponse.json({ error: 'Failed to fetch food logs' }, { status: 500 })
    }

    // Filter today's logs
    const todayLogs = (logs || []).filter(l => l.plan_date === date)

    // Calculate streak: how many consecutive days (ending today) had >= 1 eaten meal
    const allDates = [...new Set((logs || []).map(l => l.plan_date))].sort().reverse()
    let streak = 0
    const today = new Date().toISOString().split('T')[0]
    let checkDate = today
    for (const d of allDates) {
      if (d !== checkDate) break
      const dayLogs = (logs || []).filter(l => l.plan_date === d)
      const dayEaten = dayLogs.filter(l => l.eaten).length
      if (dayEaten > 0) {
        streak++
        const prev = new Date(checkDate)
        prev.setDate(prev.getDate() - 1)
        checkDate = prev.toISOString().split('T')[0]
      } else {
        break
      }
    }

    return NextResponse.json({ logs: todayLogs, streak, allLogs: logs || [] })
  } catch (err) {
    console.error('GET /api/food-log error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/food-log
// Body: { plan_date, meal_index, meal_name, eaten }
// Upserts the meal eaten status
export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not logged in' }, { status: 401 })

    const body = await req.json()
    const { plan_date, meal_index, meal_name, eaten } = body

    if (!plan_date || meal_index == null || !meal_name) {
      return NextResponse.json({ error: 'plan_date, meal_index, and meal_name are required' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('food_logs')
      .upsert(
        {
          user_id: session.user_id,
          plan_date,
          meal_index,
          meal_name,
          eaten: eaten ?? true,
          logged_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,plan_date,meal_index' }
      )

    if (error) {
      console.error('Food log upsert error:', error)
      return NextResponse.json({ error: 'Failed to save food log' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('POST /api/food-log error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
