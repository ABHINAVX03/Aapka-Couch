import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import { hashToken } from '@/lib/otp'

const DIET_FUNCTION_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-diet`
const WORKOUT_FUNCTION_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-workout`

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

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('food_type, meal_count')
      .eq('user_id', session.user_id)
      .single()

    const foodType = requestedFoodType || profile?.food_type || 'indian'

    // ── Step 1: Generate Diet Plan ──
    const dietRes = await fetch(DIET_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        notes,
        food_type: foodType,
        meal_count: profile?.meal_count || 4,
      }),
    })

    const dietData = await dietRes.json().catch(() => null)

    if (!dietRes.ok) {
      console.error('Diet function error:', dietRes.status, dietData)
      return NextResponse.json(
        { error: dietData?.error || 'Diet plan generation failed' },
        { status: dietRes.status }
      )
    }

    // ── Step 2: Generate Workout & Lifestyle ──
    const workoutRes = await fetch(WORKOUT_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({}),
    })

    const workoutData = await workoutRes.json().catch(() => null)

    // ── Combine results ──
    const plan = {
      ...(dietData.plan || {}),
      workout_plan: workoutData?.workout_plan || null,
      lifestyle_rules: workoutData?.lifestyle_rules || null,
    }

    return NextResponse.json({
      success: true,
      plan_week: dietData.plan_week,
      plan,
    })
  } catch (error) {
    console.error('POST /api/generate-plan error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}