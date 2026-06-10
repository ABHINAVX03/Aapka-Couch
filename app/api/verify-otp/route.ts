import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { cookies } from 'next/headers'
import { verifyOTP, createSessionToken } from '@/lib/otp'
import { randomUUID } from 'crypto'

// Basic in-memory attempt limiter (per-process)
const verifyAttempts: Map<string, { count: number; firstAt: number }> = new Map()

export async function POST(req: Request) {
  try {
    const { email, token } = await req.json()
    if (!email || !token) {
      return NextResponse.json(
        { error: 'Email and code required' },
        { status: 400 }
      )
    }

    const emailNorm = email.trim().toLowerCase()

    // Rate-limit verification attempts per email (6 attempts per 10 minutes)
    const now = Date.now()
    const info = verifyAttempts.get(emailNorm) || { count: 0, firstAt: now }
    if (now - info.firstAt < 10 * 60 * 1000) {
      if (info.count >= 6) return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 })
      info.count += 1
    } else {
      info.count = 1
      info.firstAt = now
    }
    verifyAttempts.set(emailNorm, info)

    // Verify OTP against our database
    const isValid = await verifyOTP(emailNorm, token)
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid or expired code' },
        { status: 401 }
      )
    }

    // Get or create user in public schema
    let { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, email, onboarding_completed')
      .eq('email', emailNorm)
      .maybeSingle()

    if (userError && userError.code !== 'PGRST116') {
      console.error('User fetch error:', userError)
      return NextResponse.json(
        { error: 'Database error' },
        { status: 500 }
      )
    }

    if (!user) {
      // Create new user with random UUID
      const userId = randomUUID()
      const { data: newUser, error: createError } = await supabaseAdmin
        .from('users')
        .insert({
          id: userId,
          email: emailNorm,
          email_verified: true,
          onboarding_completed: false,
        })
        .select('id, email, onboarding_completed')
        .single()

      if (createError) {
        console.error('User creation error:', createError)
        return NextResponse.json(
          { error: 'Failed to create user' },
          { status: 500 }
        )
      }
      user = newUser
    } else {
      // Mark existing user as verified
      await supabaseAdmin
        .from('users')
        .update({ email_verified: true })
        .eq('id', user.id)
    }

    // Generate custom session token and store its hash
    const { token: sessionToken, token_hash } = createSessionToken()

    // Set session cookie with our raw token
    const cookieStore = await cookies()
    cookieStore.set('auth-token', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    })

    // Store session token hash in database for validation
    try {
      const { error: sessionStoreError } = await supabaseAdmin.from('sessions').insert({
        user_id: user.id,
        token_hash,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
      if (sessionStoreError) {
        console.error('Session store error:', sessionStoreError)
      }
    } catch (err) {
      console.error('Session store error:', err)
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        onboardingCompleted: user.onboarding_completed,
      },
    })
  } catch (error) {
    console.error('Verify OTP error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}