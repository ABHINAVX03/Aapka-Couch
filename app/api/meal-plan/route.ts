import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import { hashToken } from '@/lib/otp'

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
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
    }

    // Return the most recent active plan
    const { data: planRow, error: planError } = await supabaseAdmin
      .from('meal_plans')
      .select('*')
      .eq('user_id', session.user_id)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (planError) {
      console.error('GET meal-plan error:', planError)
      return NextResponse.json({ error: 'Failed to fetch plan' }, { status: 500 })
    }

    return NextResponse.json({ plan: planRow || null })
  } catch (error) {
    console.error('GET /api/meal-plan error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST() {
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
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
    }

    const userId = session.user_id

    // Verify profile exists
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle()

    if (profileError) {
      console.error('Profile lookup error:', profileError)
      return NextResponse.json({ error: 'Profile lookup failed' }, { status: 500 })
    }

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Call the generate-plan edge function
    const { data: functionResult, error: functionError } = await supabaseAdmin.functions.invoke(
      'generate-plan',
      {
        body: { user_id: userId },
      }
    )

    if (functionError) {
      console.error('Edge function invocation error:', functionError)
      return NextResponse.json(
        { error: 'Plan generation failed' },
        { status: 500 }
      )
    }

    // The edge function returns { success: true, plan: { ... } }
    const plan = functionResult.plan

    return NextResponse.json({ success: true, plan })
  } catch (error) {
    console.error('POST /api/meal-plan error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}