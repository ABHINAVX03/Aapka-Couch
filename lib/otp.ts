import nodemailer from 'nodemailer'
import { supabaseAdmin } from './supabase'
import crypto from 'crypto'

// Generate 6-digit OTP using secure randomness
export function generateOTP(): string {
  return crypto.randomInt(100000, 1000000).toString()
}

// Initialize email transporter (Gmail)
function getEmailTransporter() {
  const user = process.env.GMAIL_USER
  const pass = process.env.GMAIL_APP_PASSWORD

  if (!user || !pass) {
    throw new Error('Gmail credentials not configured in environment variables')
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user,
      pass,
    },
  })
}

// Send OTP email
export async function sendOTPEmail(email: string, otp: string): Promise<boolean> {
  try {
    const transporter = getEmailTransporter()

    const mailOptions = {
      from: process.env.GMAIL_USER,
      to: email,
      subject: 'Your AapkaCoach Verification Code',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #0c0c10;">Welcome to AapkaCoach</h2>
          <p>Your verification code is:</p>
          <div style="background: #17171f; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
            <h1 style="color: #fbbf24; font-size: 36px; letter-spacing: 8px; margin: 0;">${otp}</h1>
          </div>
          <p style="color: #999;">This code expires in 10 minutes.</p>
          <p style="color: #666; font-size: 12px;">If you didn't request this code, please ignore this email.</p>
        </div>
      `,
    }

    await transporter.sendMail(mailOptions)
    console.log(`✓ OTP sent to ${email}: ${otp}`)
    return true
  } catch (error) {
    console.error('Error sending OTP email:', error)
    return false
  }
}

// ─────────────────────────────────────────────
// NEW: Send Account Deletion Confirmation Email
// ─────────────────────────────────────────────
export async function sendAccountDeletionEmail(email: string): Promise<boolean> {
  try {
    const transporter = getEmailTransporter()
    
    // Format date in Indian Standard Time
    const deleteDate = new Date().toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      dateStyle: 'full',
      timeStyle: 'long'
    })

    const mailOptions = {
      from: process.env.GMAIL_USER,
      to: email,
      subject: 'Farewell from AapkaCoach - Account Deleted',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #0c0c10;">Account Deletion Confirmation</h2>
          <p>Hello,</p>
          <p>This email is to confirm that your AapkaCoach account associated with <strong>${email}</strong> has been successfully and permanently deleted.</p>
          
          <div style="background: #17171f; padding: 20px; border-radius: 8px; margin: 20px 0; color: #fff;">
            <p style="margin: 0 0 10px 0;"><strong style="color: #fbbf24;">Action:</strong> Account & Data Deletion</p>
            <p style="margin: 0;"><strong style="color: #fbbf24;">Timestamp:</strong> ${deleteDate}</p>
          </div>

          <p><strong>What happens now?</strong></p>
          <ul style="color: #444;">
            <li>Your personal body scan data has been wiped.</li>
            <li>Your AI-generated meal and workout plans have been archived/deleted.</li>
            <li>Your email has been removed from our active system.</li>
          </ul>

          <p>We're sorry to see you go! If you ever wish to return and restart your fitness journey, you can always create a new account using this same email.</p>
          
          <p style="color: #666; font-size: 14px; margin-top: 30px;">Stay healthy,<br/><strong>Team AapkaCoach</strong></p>
        </div>
      `,
    }

    await transporter.sendMail(mailOptions)
    console.log(`✓ Deletion confirmation sent to ${email}`)
    return true
  } catch (error) {
    console.error('Error sending deletion email:', error)
    return false
  }
}

// Store OTP in database
export async function storeOTP(email: string, otp: string): Promise<boolean> {
  try {
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

    const { error } = await supabaseAdmin
      .from('otp_codes')
      .upsert(
        {
          email,
          code: otp,
          expires_at: expiresAt.toISOString(),
          created_at: new Date().toISOString(),
        },
        {
          onConflict: 'email',
        }
      )

    if (error) throw error
    return true
  } catch (error) {
    console.error('Error storing OTP:', error)
    return false
  }
}

// Verify OTP
export async function verifyOTP(email: string, otp: string): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin
      .from('otp_codes')
      .select('code, expires_at')
      .eq('email', email)
      .single()

    if (error || !data) {
      console.error('OTP not found or expired')
      return false
    }

    // Check if OTP is expired
    if (new Date() > new Date(data.expires_at)) {
      // Delete expired OTP
      await supabaseAdmin.from('otp_codes').delete().eq('email', email)
      console.error('OTP has expired')
      return false
    }

    // Verify code
    if (data.code !== otp) {
      console.error('Invalid OTP code')
      return false
    }

    // Delete used OTP
    await supabaseAdmin.from('otp_codes').delete().eq('email', email)

    return true
  } catch (error) {
    console.error('Error verifying OTP:', error)
    return false
  }
}

// Hash a token using SHA-256 (hex)
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

// Create a secure session token and its hash for storage
export function createSessionToken() {
  const token = crypto.randomBytes(32).toString('hex')
  const token_hash = hashToken(token)
  return { token, token_hash }
}