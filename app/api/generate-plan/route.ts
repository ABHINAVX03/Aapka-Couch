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

    // Fetch profile for food_type fallback
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('food_type')
      .eq('user_id', session.user_id)
      .single()

    const foodType = requestedFoodType || profile?.food_type || 'indian'

    // ✅ CRITICAL FIX: send user_id to the edge function
    const edgeRes = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        user_id: session.user_id,    // <-- added
        notes,
        food_type: foodType,
      }),
    })

    const edgeData = await edgeRes.json().catch(() => null)

    if (!edgeRes.ok) {
      console.error('Edge function error:', edgeRes.status, edgeData)
      return NextResponse.json(
        { error: edgeData?.error || 'Plan generation failed' },
        { status: edgeRes.status }
      )
    }

    return NextResponse.json(edgeData)   // already { success: true, plan }
  } catch (error) {
    console.error('POST /api/generate-plan error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}