'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function LoginPage() {
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState('')
  const [otpSent, setOtpSent] = useState(false)

  const [token, setToken] = useState('')
  const [verifying, setVerifying] = useState(false)

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setSending(true)
    setMessage('')

    try {
      const res = await fetch('/api/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      const data = await res.json()
      if (res.ok) {
        setOtpSent(true)
        setMessage('✅ Code sent! Check your email inbox.')
      } else {
        setMessage(data.error || 'Failed to send OTP')
      }
    } catch (error) {
      setMessage('Network error. Please try again.')
      console.error(error)
    } finally {
      setSending(false)
    }
  }

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setVerifying(true)
    setMessage('')

    try {
      const res = await fetch('/api/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token }),
      })

      const data = await res.json()
      if (res.ok) {
        setMessage('✅ Verification successful! Securing session...')
        // Add a slight delay so the user can read the success message
        setTimeout(() => {
          router.push(data.user?.onboardingCompleted ? '/dashboard' : '/onboarding')
        }, 1200)
      } else {
        setMessage(data.error || 'Verification failed. Incorrect code.')
        setVerifying(false)
      }
    } catch (error) {
      setMessage('Network error. Please try again.')
      setVerifying(false)
    }
  }

  const handleResend = async () => {
    setSending(true)
    try {
      const res = await fetch('/api/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      if (res.ok) {
        setMessage('✅ Code resent! Check your email.')
      } else {
        setMessage('Failed to resend code. Try again later.')
      }
    } catch (error) {
      setMessage('Network error')
    } finally {
      setSending(false)
    }
  }

  // Helper to determine if the message is a success or error message
  const isSuccessMessage = message.includes('✅')

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0c0c10] text-white p-4 relative overflow-hidden">
      
      {/* Background ambient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-yellow-500/5 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="w-full max-w-sm relative z-10">
        {!otpSent ? (
          <form onSubmit={handleSendOtp} className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center mb-8">
              <h1 className="text-4xl font-extrabold tracking-tight mb-2">
                Aapka<span className="text-yellow-500">Coach</span>
              </h1>
              <p className="text-gray-400 text-sm">
                Enter your email to sign in or create an account.
              </p>
            </div>
            
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full p-4 bg-[#17171f] border border-[#222230] rounded-xl text-white placeholder-gray-500 focus:border-yellow-500 focus:ring-4 focus:ring-yellow-500/10 outline-none transition-all"
              required
              disabled={sending}
            />
            
            {message && (
              <div className={`p-3 rounded-xl text-sm font-medium text-center animate-in zoom-in-95 duration-200 ${isSuccessMessage ? 'bg-green-500/10 border border-green-500/20 text-green-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'}`}>
                {message}
              </div>
            )}
            
            <button
              type="submit"
              disabled={sending}
              className="w-full py-4 bg-yellow-500 text-black font-bold text-lg rounded-xl hover:bg-yellow-400 disabled:opacity-50 transition-all shadow-[0_0_15px_rgba(234,179,8,0.2)]"
            >
              {sending ? 'Sending Secure Code...' : 'Continue'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-6 animate-in slide-in-from-right-8 duration-500">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-extrabold mb-2">Check your inbox</h1>
              <p className="text-gray-400 text-sm">
                We sent a 6‑digit code to <span className="text-yellow-500 font-medium">{email}</span>
              </p>
            </div>
            
            <input
              type="text"
              placeholder="000000"
              value={token}
              onChange={e => setToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="w-full p-4 bg-[#17171f] border border-[#222230] rounded-xl text-white text-center text-3xl tracking-[0.5em] font-mono focus:border-yellow-500 focus:ring-4 focus:ring-yellow-500/10 outline-none transition-all"
              maxLength={6}
              required
              disabled={verifying}
              autoFocus
            />
            
            {message && (
              <div className={`p-3 rounded-xl text-sm font-medium text-center animate-in zoom-in-95 duration-200 ${isSuccessMessage ? 'bg-green-500/10 border border-green-500/20 text-green-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'}`}>
                {message}
              </div>
            )}
            
            <button
              type="submit"
              disabled={verifying || token.length < 6}
              className="w-full py-4 bg-yellow-500 text-black font-bold text-lg rounded-xl hover:bg-yellow-400 disabled:opacity-50 transition-all shadow-[0_0_15px_rgba(234,179,8,0.2)]"
            >
              {verifying ? 'Verifying...' : 'Verify Code'}
            </button>
            
            <div className="flex flex-col gap-2 pt-4">
              <button
                type="button"
                onClick={handleResend}
                disabled={sending}
                className="w-full py-2 text-yellow-500 hover:text-yellow-400 text-sm font-medium transition-colors"
              >
                {sending ? 'Resending...' : "Didn't receive code? Resend"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setOtpSent(false)
                  setToken('')
                  setMessage('')
                }}
                className="w-full py-2 text-gray-500 hover:text-gray-300 text-sm transition-colors"
              >
                Use a different email
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}