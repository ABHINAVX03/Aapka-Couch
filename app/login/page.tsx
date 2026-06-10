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
        setMessage('Check your email for the verification code')
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
        // Redirect based on onboarding status
        router.push(data.user?.onboardingCompleted ? '/dashboard' : '/onboarding')
      } else {
        setMessage(data.error || 'Verification failed')
      }
    } catch (error) {
      setMessage('Network error. Please try again.')
      console.error(error)
    } finally {
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
        setMessage('Code resent! Check your email.')
      } else {
        setMessage('Failed to resend code')
      }
    } catch (error) {
      setMessage('Network error')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0c0c10] text-white p-4">
      {!otpSent ? (
        <form onSubmit={handleSendOtp} className="w-full max-w-sm space-y-6">
          <h1 className="text-3xl font-extrabold text-center">
            Aapka<span className="text-yellow-500">Coach</span>
          </h1>
          <p className="text-center text-gray-400 text-sm">
            Enter your email to sign in or create an account.
          </p>
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full p-3 bg-[#17171f] border border-[#222230] rounded-lg text-white placeholder-gray-500"
            required
            disabled={sending}
          />
          {message && (
            <p className={`text-sm ${message.includes('success') ? 'text-green-400' : 'text-red-400'}`}>
              {message}
            </p>
          )}
          <button
            type="submit"
            disabled={sending}
            className="w-full py-3 bg-yellow-500 text-black font-bold rounded-lg hover:bg-yellow-600 disabled:opacity-50 transition"
          >
            {sending ? 'Sending...' : 'Send Code'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerifyOtp} className="w-full max-w-sm space-y-6">
          <h1 className="text-3xl font-extrabold text-center">Check your inbox</h1>
          <p className="text-center text-gray-400 text-sm">
            We sent a 6‑digit code to <span className="text-yellow-500">{email}</span>
          </p>
          <input
            type="text"
            placeholder="000000"
            value={token}
            onChange={e => setToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="w-full p-3 bg-[#17171f] border border-[#222230] rounded-lg text-white text-center text-2xl tracking-widest"
            maxLength={6}
            required
            disabled={verifying}
            autoFocus
          />
          {message && (
            <p className={`text-sm ${message.includes('success') ? 'text-green-400' : 'text-red-400'}`}>
              {message}
            </p>
          )}
          <button
            type="submit"
            disabled={verifying}
            className="w-full py-3 bg-yellow-500 text-black font-bold rounded-lg hover:bg-yellow-600 disabled:opacity-50 transition"
          >
            {verifying ? 'Verifying...' : 'Verify Code'}
          </button>
          <button
            type="button"
            onClick={handleResend}
            disabled={sending}
            className="w-full py-2 text-yellow-500 hover:text-yellow-400 text-sm font-medium"
          >
            {sending ? 'Resending...' : "Didn't receive code? Resend"}
          </button>
          <button
            type="button"
            onClick={() => {
              setOtpSent(false)
              setEmail('')
              setToken('')
              setMessage('')
            }}
            className="w-full py-2 text-gray-400 hover:text-gray-300 text-sm"
          >
            Back to email entry
          </button>
        </form>
      )}
    </div>
  )
}