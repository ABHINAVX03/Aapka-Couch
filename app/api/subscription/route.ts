import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import { hashToken } from '@/lib/otp'

async function getSessionUserId() {
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

  return session?.user_id || null
}

export async function POST() {
  try {
    const userId = await getSessionUserId()
    if (!userId) return NextResponse.json({ error: 'Not logged in' }, { status: 401 })

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('paid_weeks')
      .eq('user_id', userId)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    const newPaidWeeks = (profile.paid_weeks || 1) + 1
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ paid_weeks: newPaidWeeks, updated_at: new Date().toISOString() })
      .eq('user_id', userId)

    if (updateError) {
      console.error('Subscription update error:', updateError)
      return NextResponse.json({ error: 'Failed to update subscription' }, { status: 500 })
    }

    return NextResponse.json({ success: true, paid_weeks: newPaidWeeks })
  } catch (error) {
    console.error('POST /api/subscription error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
