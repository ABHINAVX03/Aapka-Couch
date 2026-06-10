import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import { hashToken } from '@/lib/otp'

const EDGE_FUNCTION_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-plan`

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies()
    const authToken = cookieStore.get('auth-token')?.value

    if (!authToken) {
      return NextResponse.json({ error: 'Not logged in' }, { status: 401 })
    }

    // Validate session exists before forwarding
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
      return NextResponse.json({ error: `Week ${nextWeek} is locked. Buy week ${nextWeek} to continue your subscription.` }, { status: 402 })
    }

    const foodType = requestedFoodType || (profile && profile.food_type) || 'indian'

    // Forward request to Supabase Edge Function with server-side cookie token
    const edgeRes = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({ notes, food_type: foodType }),
    })

    const edgeData = await edgeRes.json().catch(() => null)

    if (!edgeRes.ok) {
      console.error('Edge function error:', edgeRes.status, edgeData)
      return NextResponse.json({ error: edgeData?.error ?? 'Plan generation failed. Please try again.' }, { status: edgeRes.status })
    }

    // Return the edge function JSON directly so client receives { success, plan }
    return NextResponse.json(edgeData)
  } catch (error) {
    console.error('POST /api/generate-plan error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
import { hashToken } from '@/lib/otp'
