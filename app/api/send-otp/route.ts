import { NextResponse } from 'next/server'
import { generateOTP, sendOTPEmail, storeOTP } from '@/lib/otp'
import { supabaseAdmin } from '@/lib/supabase'

// Basic in-memory throttle (per-process)
const sendMap: Map<string, { lastSent: number; count: number }> = new Map()

export async function POST(req: Request) {
  try {
    const { email } = await req.json()
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
    }

    const emailNorm = email.trim().toLowerCase()
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(emailNorm)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
    }

    const now = Date.now()
    const st = sendMap.get(emailNorm) || { lastSent: 0, count: 0 }
    if (now - st.lastSent < 60_000) {
      return NextResponse.json({ error: 'Please wait before requesting another code' }, { status: 429 })
    }
    if (now - st.lastSent < 60 * 60 * 1000) {
      if (st.count >= 6) return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 })
      st.count += 1
    } else {
      st.count = 1
    }
    st.lastSent = now
    sendMap.set(emailNorm, st)

    // small safety: avoid regenerating if an OTP was just created server-side
    try {
      const { data: existing } = await supabaseAdmin.from('otp_codes').select('created_at').eq('email', emailNorm).maybeSingle()
      if (existing && existing.created_at) {
        const created = new Date(existing.created_at).getTime()
        if (now - created < 30_000) {
          return NextResponse.json({ error: 'Please wait before requesting another code' }, { status: 429 })
        }
      }
    } catch (e) {
      // ignore DB check failures
    }

    // Generate OTP
    const otp = generateOTP()

    // Store OTP in database (use normalized email)
    const stored = await storeOTP(emailNorm, otp)
    if (!stored) {
      return NextResponse.json(
        { error: 'Failed to process request. Please try again.' },
        { status: 500 }
      )
    }

    // Send OTP email
    const sent = await sendOTPEmail(email, otp)
    if (!sent) {
      return NextResponse.json(
        { error: 'Failed to send email. Please check your email address.' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      message: 'OTP sent successfully',
      email,
    })
  } catch (error) {
    console.error('Send OTP error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}