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
      cookieStore.delete('auth-token')
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
    }

    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, email, onboarding_completed')
      .eq('id', session.user_id)
      .single()

    if (userError) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('user_id', session.user_id)
      .maybeSingle()

    return NextResponse.json({ user: { ...user, profile: profile || null } })
  } catch (error) {
    console.error('GET /api/me error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
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
      cookieStore.delete('auth-token')
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
    }

    const body = await req.json()
    const { onboarding_completed, ...profileData } = body

    function sanitizeProfile(data: any) {
      const out: any = {}
      const asNumber = (v: any) => v === '' || v == null ? NaN : Number(v)

      const allowed = {
        sex: ['male', 'female'],
        dietary_pattern: ['eggetarian', 'vegetarian', 'non-veg', 'non_veg', 'vegan'],
        activity_level: ['sedentary', 'light', 'moderate', 'heavy'],
        primary_goal: ['fat_loss', 'muscle_gain', 'recomp'],
        meal_timing: ['if_14_10', 'if_16_8', '3_meals', '4_meals', '6_meals'],
        eating_environment: ['home_cooked', 'hostel_mess', 'canteen', 'tiffin'],
        food_type: ['indian', 'english', 'western', 'mixed', 'both'],
      }

      for (const key of Object.keys(data)) {
        const val = data[key]
        if (val === undefined) continue

        // Removed daily_budget from this list
        if ([
          'age', 'height_cm', 'weight_kg', 'body_fat_percent', 'visceral_fat', 'waist_inches',
          'upper_abdomen_inches', 'hips_inches', 'body_age', 'rmr_estimated',
          'sleep_hours', 'stress_level', 'target_bf_percent', 'timeframe_weeks'
        ].includes(key)) {
          const n = asNumber(val)
          out[key] = isNaN(n) ? null : (n as any)
          continue
        }

        if (Object.keys(allowed).includes(key)) {
          if (allowed[key as keyof typeof allowed].includes(val)) out[key] = val
          else out[key] = null
          continue
        }

        if (typeof val === 'string') out[key] = String(val).trim()
      }
      return out
    }

    if (onboarding_completed !== undefined) {
      await supabaseAdmin.from('users').update({ onboarding_completed }).eq('id', session.user_id)
    }

    if (Object.keys(profileData).length > 0) {
      const sanitized = sanitizeProfile(profileData)
      await supabaseAdmin.from('profiles').upsert(
        { user_id: session.user_id, ...sanitized, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      )
    }

    const { data: user } = await supabaseAdmin.from('users').select('id, email, onboarding_completed').eq('id', session.user_id).single()
    return NextResponse.json({ user })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}