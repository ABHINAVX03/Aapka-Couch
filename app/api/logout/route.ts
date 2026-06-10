import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import { hashToken } from '@/lib/otp'

export async function POST() {
  try {
    const cookieStore = await cookies()
    const authToken = cookieStore.get('auth-token')?.value

    if (authToken) {
      // Invalidate session in database (match hashed token)
      try {
        const tokenHash = hashToken(authToken)
        const { error } = await supabaseAdmin
          .from('sessions')
          .delete()
          .eq('token_hash', tokenHash)
        if (error) {
          console.error('Database session deletion failed:', error)
        }
      } catch (err) {
        console.error('Database session deletion failed:', err)
      }
    }
    
    // Clear auth cookies
    cookieStore.delete('auth-token')

    return NextResponse.json({ message: 'Logged out successfully' })
  } catch (error) {
    console.error('Logout error:', error)
    return NextResponse.json(
      { error: 'Logout failed' },
      { status: 500 }
    )
  }
}

