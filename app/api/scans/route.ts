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

    // Verify token against sessions table
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

    // Fetch scans for this user
    const { data: scans, error: scansError } = await supabaseAdmin
      .from('bca_scans')
      .select('*')
      .eq('user_id', session.user_id)
      .order('scan_date', { ascending: true })

    if (scansError) {
      console.error('Scans fetch error:', scansError)
      return NextResponse.json(
        { error: 'Failed to fetch scans' },
        { status: 500 }
      )
    }

    return NextResponse.json({ scans: scans || [] })
  } catch (error) {
    console.error('GET /api/scans error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies()
    const authToken = cookieStore.get('auth-token')?.value

    if (!authToken) {
      return NextResponse.json({ error: 'Not logged in' }, { status: 401 })
    }

    // Verify token against sessions table
    const tokenHash2 = hashToken(authToken)
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('sessions')
      .select('user_id')
      .eq('token_hash', tokenHash2)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()

    if (sessionError || !session) {
      cookieStore.delete('auth-token')
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
    }

    const body = await req.json()
    const {
      scan_date,
      weight_kg,
      body_fat_percent,
      waist_inches,
      visceral_fat,
    } = body

    // Validate required fields
    if (!scan_date) {
      return NextResponse.json({ error: 'Scan date is required' }, { status: 400 })
    }

    // Insert scan
    const { data: scan, error: insertError } = await supabaseAdmin
      .from('bca_scans')
      .insert({
        user_id: session.user_id,
        scan_date,
        weight_kg,
        body_fat_percent,
        waist_inches,
        visceral_fat,
      })
      .select()
      .single()

    if (insertError) {
      console.error('Scan insert error:', insertError)
      return NextResponse.json(
        { error: 'Failed to save scan' },
        { status: 500 }
      )
    }

    return NextResponse.json({ scan })
  } catch (error) {
    console.error('POST /api/scans error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

