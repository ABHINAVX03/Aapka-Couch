import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import { hashToken } from '@/lib/otp'

// Edge function URL
const EDGE_FUNCTION_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-plan`

// ─────────────────────────────────────────────
// GET  /api/meal-plan  — fetch the latest saved plan
// ─────────────────────────────────────────────
export async function GET() {
  try {
    const cookieStore = await cookies()
    const authToken = cookieStore.get('auth-token')?.value

    if (!authToken) {
      return NextResponse.json({ error: 'Not logged in' }, { status: 401 })
    }

    const tokenHash = hashToken(authToken)
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('sessions')
      .select('user_id')
      .eq('token_hash', tokenHash)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()

    if (sessionError || !session) {
      const res = NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
      res.cookies.delete('auth-token')
      return res
    }

    const { data: planRow, error: planError } = await supabaseAdmin
      .from('meal_plans')
      .select('plan_json, generated_at')
      .eq('user_id', session.user_id)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (planError) {
      console.error('Plan fetch error:', planError)
      return NextResponse.json({ error: 'Failed to fetch plan' }, { status: 500 })
    }

    if (!planRow) return NextResponse.json({ plan: null })

    const planJson = planRow.plan_json || {}
    const planWeek = planJson.plan_week ?? null
    return NextResponse.json({ plan: { ...planJson, plan_week: planWeek, generated_at: planRow.generated_at } })
  } catch (error) {
    console.error('GET /api/meal-plan error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─────────────────────────────────────────────
// POST /api/meal-plan  — generate a new plan via Edge Function
// ─────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    const cookieStore = await cookies()
    const authToken = cookieStore.get('auth-token')?.value

    if (!authToken) {
      return NextResponse.json({ error: 'Not logged in' }, { status: 401 })
    }

    const tokenHash = hashToken(authToken)
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('sessions')
      .select('user_id')
      .eq('token_hash', tokenHash)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()

    if (sessionError || !session) {
      const res = NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
      res.cookies.delete('auth-token')
      return res
    }

    const body = await req.json().catch(() => ({}))
    const notes = typeof body.notes === 'string' ? body.notes.trim() : ''
    const requestedFoodType = typeof body.food_type === 'string' ? body.food_type.trim().toLowerCase() : ''

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('paid_weeks, food_type')
      .eq('user_id', session.user_id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    const { count, error: countError } = await supabaseAdmin
      .from('meal_plans')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', session.user_id)

    if (countError) {
      console.error('Plan count error:', countError)
      return NextResponse.json({ error: 'Unable to check current plan status' }, { status: 500 })
    }

    const planCount = typeof count === 'number' ? count : 0
    const nextWeek = planCount + 1

    if (planCount > 0 && nextWeek > (profile.paid_weeks || 1)) {
      return NextResponse.json({
        error: `Week ${nextWeek} is locked. Buy week ${nextWeek} to continue your subscription.`,
      }, { status: 402 })
    }

    const foodType = requestedFoodType || (profile && profile.food_type) || 'indian'

    // ── Call the Supabase Edge Function ──
    const edgeRes = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({ user_id: session.user_id, notes, food_type: foodType }),
    })

    const edgeData = await edgeRes.json()

    if (!edgeRes.ok) {
      console.error('Edge function error:', edgeRes.status, edgeData)
      // TEMPORARY – show the real error in the browser
      return NextResponse.json(
        { error: edgeData?.error || 'Plan generation failed', details: edgeData },
        { status: edgeRes.status }
      )
    }

    return NextResponse.json({ success: true, plan: edgeData.plan })
  } catch (error) {
    console.error('POST /api/meal-plan error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}