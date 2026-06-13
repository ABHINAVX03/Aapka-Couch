import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import { hashToken } from '@/lib/otp'

export async function GET() {
  try {
    const cookieStore = await cookies()
    const authToken = cookieStore.get('auth-token')?.value
    if (!authToken) return NextResponse.json({ error: 'Not logged in' }, { status: 401 })

    const tokenHash = hashToken(authToken)
    const { data: session } = await supabaseAdmin
      .from('sessions')
      .select('user_id')
      .eq('token_hash', tokenHash)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()

    if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 })

    // ✅ FIX: Added plan_week to the select statement so the UI stops showing Week 0
    const { data: plans, error } = await supabaseAdmin
      .from('meal_plans')
      .select('id, generated_at, plan_json, plan_week')
      .eq('user_id', session.user_id)
      .order('generated_at', { ascending: false })
      .limit(10)

    if (error) {
      console.error('Plans fetch error:', error)
      return NextResponse.json({ error: 'Failed to fetch plans' }, { status: 500 })
    }

    return NextResponse.json({ plans: plans || [] })
  } catch (err) {
    console.error('GET /api/meal-plans error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}