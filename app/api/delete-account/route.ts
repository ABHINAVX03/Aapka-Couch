import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import { hashToken } from '@/lib/otp'

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
      cookieStore.delete('auth-token')
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const emailConfirmation = typeof body.email_confirmation === 'string' ? body.email_confirmation.trim() : ''

    if (!emailConfirmation) {
      return NextResponse.json({ error: 'Email confirmation is required.' }, { status: 400 })
    }

    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, email')
      .eq('id', session.user_id)
      .single()

    if (userError || !user) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 })
    }

    if (user.email.toLowerCase() !== emailConfirmation.toLowerCase()) {
      return NextResponse.json({ error: 'Confirmation email does not match.' }, { status: 400 })
    }

    // Remove any outstanding OTP codes for this email
    await supabaseAdmin.from('otp_codes').delete().eq('email', user.email)

    // Delete the user - cascades into sessions, profiles, bca_scans, meal_plans
    const { error: deleteError } = await supabaseAdmin
      .from('users')
      .delete()
      .eq('id', user.id)

    if (deleteError) {
      console.error('Account deletion failed:', deleteError)
      return NextResponse.json({ error: 'Failed to delete account.' }, { status: 500 })
    }

    cookieStore.delete('auth-token')
    return NextResponse.json({ message: 'Account deleted successfully.' })
  } catch (error) {
    console.error('POST /api/delete-account error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
