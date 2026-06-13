'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

// ── Macro Ring SVG ────────────────────────────────────────────────────────────
function MacroRing() {
  const [animated, setAnimated] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 300)
    return () => clearTimeout(t)
  }, [])

  const cx = 160, cy = 160, r = 120
  const circumference = 2 * Math.PI * r

  const macros = [
    { label: 'Protein', pct: 0.35, color: '#F5C518', offset: 0 },
    { label: 'Carbs', pct: 0.42, color: '#ff9500', offset: 0.35 },
    { label: 'Fat', pct: 0.23, color: '#ffffff', offset: 0.77 },
  ]

  return (
    <div className="relative flex items-center justify-center w-[320px] h-[320px] mx-auto">
      <svg width="320" height="320" viewBox="0 0 320 320" className="absolute inset-0 -rotate-90">
        {/* track */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1e1e2e" strokeWidth="18" />
        {macros.map((m, i) => {
          const dash = circumference * m.pct
          const gap = circumference - dash
          const offsetDash = circumference * m.offset
          return (
            <circle
              key={i}
              cx={cx} cy={cy} r={r}
              fill="none"
              stroke={m.color}
              strokeWidth="18"
              strokeLinecap="round"
              strokeDasharray={animated ? `${dash} ${gap}` : `0 ${circumference}`}
              strokeDashoffset={-offsetDash}
              style={{
                transition: `stroke-dasharray 1.2s cubic-bezier(0.4,0,0.2,1) ${i * 0.18}s`,
                filter: m.color === '#F5C518' ? 'drop-shadow(0 0 8px #F5C51888)' : 'none',
              }}
            />
          )
        })}
      </svg>
      {/* centre stats */}
      <div className="relative z-10 text-center">
        <div className="text-4xl font-extrabold text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>1,840</div>
        <div className="text-xs text-gray-400 mt-1 tracking-widest uppercase">kcal / day</div>
      </div>
      {/* legend */}
      <div className="absolute -right-8 top-1/2 -translate-y-1/2 flex flex-col gap-3">
        {macros.map((m, i) => (
          <div key={i} className="flex items-center gap-2 text-xs whitespace-nowrap">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: m.color }} />
            <span className="text-gray-400">{m.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Animated counter ──────────────────────────────────────────────────────────
function Counter({ to, suffix = '', duration = 1400 }: { to: number; suffix?: string; duration?: number }) {
  const [val, setVal] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  const started = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started.current) {
        started.current = true
        const start = performance.now()
        const tick = (now: number) => {
          const p = Math.min((now - start) / duration, 1)
          setVal(Math.floor(p * p * to))
          if (p < 1) requestAnimationFrame(tick)
          else setVal(to)
        }
        requestAnimationFrame(tick)
      }
    }, { threshold: 0.3 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [to, duration])

  return <span ref={ref}>{val.toLocaleString()}{suffix}</span>
}

// ── Fade-in on scroll ─────────────────────────────────────────────────────────
function FadeIn({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); observer.disconnect() }
    }, { threshold: 0.1 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(28px)',
        transition: `opacity 0.7s ease ${delay}ms, transform 0.7s ease ${delay}ms`,
      }}
    >
      {children}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function HomePage() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const features = [
    {
      icon: '🧬',
      title: 'Body-composition macros',
      desc: 'We use your BCA scan — weight, body fat %, LBM — to calculate exact protein, carbs, and fat targets. Not a one-size-fits-all formula.',
      size: 'large',
    },
    {
      icon: '🥘',
      title: '100% Indian foods',
      desc: 'Dal chawal, paneer bhurji, oats upma, curd rice. Every meal is something you can find in your mess or make on a single burner.',
      size: 'normal',
    },
    {
      icon: '📈',
      title: 'Weekly progress charts',
      desc: 'Log BCA scans. See body fat and lean mass trend over time.',
      size: 'normal',
    },
    {
      icon: '⚡',
      title: 'Instant OTP login',
      desc: 'No passwords. No Google. Just your email and a one-time code. You\'re in under 30 seconds.',
      size: 'normal',
    },
    {
      icon: '🔒',
      title: 'Private by design',
      desc: 'No ads. No data selling. Your health data is yours.',
      size: 'normal',
    },
  ]

  const steps = [
    { title: 'Answer 8 questions', desc: 'Age, weight, body fat, activity, diet type. Under 2 minutes.' },
    { title: 'AI builds your plan', desc: 'Exact calories, macros, and a 7-day Indian meal plan — generated in seconds.' },
    { title: 'Track & improve', desc: 'Log weekly scans. Watch your numbers move in the right direction.' },
  ]

  const testimonials = [
    {
      quote: 'Went from 17% to 13% body fat in 10 weeks eating hostel food. I didn\'t think that was even possible.',
      name: 'Abhinav G.',
      detail: 'MCA student, IIIT • 74 kg • 178 cm',
      stat: '−4% body fat',
    },
    {
      quote: 'Every other app told me to eat avocado toast. AapkaCoach gave me a plan around dal and eggs. Actually usable.',
      name: 'Riya S.',
      detail: 'Working professional, 28',
      stat: '−6 kg in 12 weeks',
    },
  ]

  return (
    <>
      {/* Google Font */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700;800&family=Inter:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; }
        :root {
          --gold: #F5C518;
          --gold-dim: #F5C51820;
          --amber: #ff9500;
          --bg: #0c0c10;
          --surface: #13131a;
          --surface2: #1a1a26;
          --border: #222232;
          --border-hover: #F5C51840;
          --text: #ffffff;
          --muted: #8888a8;
          --faint: #3a3a5a;
        }
        html { scroll-behavior: smooth; }

        .display { font-family: 'Space Grotesk', sans-serif; }
        .body-font { font-family: 'Inter', sans-serif; }

        /* Nav glass */
        .nav-glass {
          backdrop-filter: blur(14px);
          background: rgba(12,12,16,0.85);
          border-bottom: 1px solid var(--border);
        }

        /* Gold glow button */
        .btn-gold {
          background: var(--gold);
          color: #000;
          font-family: 'Space Grotesk', sans-serif;
          font-weight: 700;
          border-radius: 100px;
          transition: background 0.2s, box-shadow 0.2s, transform 0.15s;
          box-shadow: 0 0 24px rgba(245,197,24,0.25);
        }
        .btn-gold:hover {
          background: #ffd64a;
          box-shadow: 0 0 40px rgba(245,197,24,0.45);
          transform: translateY(-1px);
        }

        .btn-outline {
          border: 1px solid var(--border);
          color: var(--muted);
          border-radius: 100px;
          font-family: 'Inter', sans-serif;
          font-weight: 500;
          transition: border-color 0.2s, color 0.2s;
          background: transparent;
        }
        .btn-outline:hover { border-color: var(--gold); color: #fff; }

        /* Feature card */
        .feat-card {
          background: var(--surface2);
          border: 1px solid var(--border);
          border-radius: 20px;
          transition: border-color 0.2s, transform 0.2s, box-shadow 0.2s;
        }
        .feat-card:hover {
          border-color: var(--border-hover);
          transform: translateY(-3px);
          box-shadow: 0 8px 32px rgba(245,197,24,0.06);
        }

        /* Stat pill */
        .stat-pill {
          background: var(--surface2);
          border: 1px solid var(--border);
          border-radius: 100px;
        }

        /* Glowing grid line */
        .grid-accent {
          background: linear-gradient(90deg, transparent, var(--gold), transparent);
          height: 1px;
          opacity: 0.2;
        }

        /* Step connector */
        .step-line {
          width: 1px;
          background: linear-gradient(to bottom, var(--gold), transparent);
          margin: 0 auto;
          opacity: 0.3;
        }

        /* Testimonial card */
        .testi-card {
          background: var(--surface2);
          border: 1px solid var(--border);
          border-radius: 20px;
          transition: border-color 0.2s;
        }
        .testi-card:hover { border-color: var(--border-hover); }

        /* Bento grid */
        .bento { display: grid; gap: 16px; }
        @media (min-width: 768px) {
          .bento { grid-template-columns: repeat(3, 1fr); }
          .bento-large { grid-column: span 2; }
        }

        /* Ambient glow behind hero */
        .hero-glow {
          position: absolute;
          width: 600px; height: 600px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(245,197,24,0.07) 0%, transparent 70%);
          pointer-events: none;
        }

        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
        }
      `}</style>

      <div style={{ background: 'var(--bg)', color: 'var(--text)', minHeight: '100vh', fontFamily: "'Inter', sans-serif" }}>

        {/* ── NAV ────────────────────────────────────────────────── */}
        <nav className="nav-glass" style={{
          position: 'sticky', top: 0, zIndex: 50,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 24px',
        }}>
          <div className="display" style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px' }}>
            Aapka<span style={{ color: 'var(--gold)' }}>Coach</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <a href="#how-it-works" className="btn-outline" style={{ padding: '8px 18px', fontSize: 13, textDecoration: 'none', display: 'none' }}>How it works</a>
            <Link href="/login" className="btn-gold" style={{ padding: '9px 22px', fontSize: 13, textDecoration: 'none', display: 'inline-block' }}>
              Get started →
            </Link>
          </div>
        </nav>

        {/* ── HERO ───────────────────────────────────────────────── */}
        <section style={{ position: 'relative', overflow: 'hidden', padding: '80px 24px 100px' }}>
          {/* ambient glows */}
          <div className="hero-glow" style={{ top: -200, left: -100 }} />
          <div className="hero-glow" style={{ bottom: -200, right: -100, background: 'radial-gradient(circle, rgba(255,149,0,0.05) 0%, transparent 70%)' }} />

          <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr', gap: 60, alignItems: 'center' }}>
            {/* copy side */}
            <div style={{ maxWidth: 640, margin: '0 auto', textAlign: 'center' }}>
              {/* eyebrow */}
              <div className="stat-pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 16px', marginBottom: 28, fontSize: 12, color: 'var(--muted)' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block', boxShadow: '0 0 6px #22c55e' }} />
                <span className="display" style={{ fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', fontSize: 11 }}>Live · Free to start</span>
              </div>

              <h1 className="display" style={{ fontSize: 'clamp(38px, 7vw, 68px)', fontWeight: 800, lineHeight: 1.08, letterSpacing: '-1.5px', margin: '0 0 24px' }}>
                The fitness coach<br />
                <span style={{ color: 'var(--gold)' }}>built for India</span>
              </h1>

              <p style={{ fontSize: 18, color: 'var(--muted)', lineHeight: 1.7, margin: '0 0 40px', maxWidth: 480, marginLeft: 'auto', marginRight: 'auto' }}>
                Exact macros from your BCA scan. A 7-day meal plan using Indian foods.
                A workout built for your schedule. All personalised — not templated.
              </p>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                <Link href="/login" className="btn-gold" style={{ padding: '14px 32px', fontSize: 16, textDecoration: 'none', display: 'inline-block' }}>
                  Build my plan — free
                </Link>
                <a href="#how-it-works" className="btn-outline" style={{ padding: '14px 28px', fontSize: 15, textDecoration: 'none', display: 'inline-block' }}>
                  See how it works
                </a>
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', gap: 28, marginTop: 36, fontSize: 13, color: 'var(--faint)' }}>
                <span>✓ No credit card</span>
                <span>✓ 2-minute setup</span>
                <span>✓ Indian foods only</span>
              </div>
            </div>

            {/* ring visual */}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 28,
                padding: '40px 60px 36px',
                position: 'relative',
                boxShadow: '0 0 60px rgba(245,197,24,0.04)',
              }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 24, textAlign: 'center' }} className="display">
                  Your daily macro target
                </div>
                <MacroRing />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginTop: 32, textAlign: 'center' }}>
                  {[['137g', 'Protein', '#F5C518'], ['193g', 'Carbs', '#ff9500'], ['51g', 'Fat', '#ffffff']].map(([val, label, color]) => (
                    <div key={label} style={{ background: '#0c0c10', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 6px' }}>
                      <div className="display" style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── STATS BAR ──────────────────────────────────────────── */}
        <div className="grid-accent" />
        <section style={{ padding: '40px 24px', background: 'var(--surface)' }}>
          <div style={{ maxWidth: 900, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 32, textAlign: 'center' }}>
            {[
              { val: 2400, suffix: '+', label: 'Plans generated' },
              { val: 94, suffix: '%', label: 'Hit macro targets' },
              { val: 10, suffix: ' weeks', label: 'Avg. first result' },
              { val: 0, suffix: ' ads', label: 'In our product' },
            ].map((s, i) => (
              <FadeIn key={i} delay={i * 80}>
                <div className="display" style={{ fontSize: 36, fontWeight: 800, color: 'var(--gold)', letterSpacing: '-1px' }}>
                  <Counter to={s.val} suffix={s.suffix} />
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{s.label}</div>
              </FadeIn>
            ))}
          </div>
        </section>
        <div className="grid-accent" />

        {/* ── FEATURES ───────────────────────────────────────────── */}
        <section id="features" style={{ padding: '100px 24px', maxWidth: 1000, margin: '0 auto' }}>
          <FadeIn>
            <div style={{ textAlign: 'center', marginBottom: 60 }}>
              <div style={{ fontSize: 11, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 14, fontWeight: 600 }} className="display">Why it works</div>
              <h2 className="display" style={{ fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 800, letterSpacing: '-0.5px', margin: 0 }}>
                Built different. Not just branded different.
              </h2>
            </div>
          </FadeIn>

          <div className="bento">
            {features.map((f, i) => (
              <FadeIn key={i} delay={i * 60} className={f.size === 'large' ? 'bento-large' : ''}>
                <div className="feat-card" style={{ padding: 28, height: '100%' }}>
                  <div style={{ fontSize: 28, marginBottom: 16 }}>{f.icon}</div>
                  <h3 className="display" style={{ fontSize: 17, fontWeight: 700, margin: '0 0 10px', color: '#fff' }}>{f.title}</h3>
                  <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.65, margin: 0 }}>{f.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </section>

        {/* ── HOW IT WORKS ───────────────────────────────────────── */}
        <section id="how-it-works" style={{ padding: '80px 24px', maxWidth: 560, margin: '0 auto' }}>
          <FadeIn>
            <div style={{ textAlign: 'center', marginBottom: 64 }}>
              <div style={{ fontSize: 11, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 14, fontWeight: 600 }} className="display">The process</div>
              <h2 className="display" style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 800, letterSpacing: '-0.5px', margin: 0 }}>
                Your plan in under 3 minutes
              </h2>
            </div>
          </FadeIn>

          <div style={{ position: 'relative' }}>
            {steps.map((s, i) => (
              <FadeIn key={i} delay={i * 120}>
                <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', marginBottom: i < steps.length - 1 ? 0 : 0 }}>
                  {/* number + connector */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                    <div className="display" style={{
                      width: 48, height: 48, borderRadius: '50%',
                      background: i === 0 ? 'var(--gold)' : 'var(--surface2)',
                      border: i === 0 ? 'none' : '1px solid var(--border)',
                      color: i === 0 ? '#000' : 'var(--muted)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 800, fontSize: 16, flexShrink: 0,
                    }}>
                      {i + 1}
                    </div>
                    {i < steps.length - 1 && (
                      <div className="step-line" style={{ height: 64, width: 1 }} />
                    )}
                  </div>
                  <div style={{ paddingBottom: i < steps.length - 1 ? 48 : 0, paddingTop: 10 }}>
                    <h3 className="display" style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>{s.title}</h3>
                    <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.65, margin: 0 }}>{s.desc}</p>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </section>

        {/* ── TESTIMONIALS ───────────────────────────────────────── */}
        <section style={{ padding: '80px 24px' }}>
          <FadeIn>
            <div style={{ textAlign: 'center', marginBottom: 52 }}>
              <div style={{ fontSize: 11, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 14, fontWeight: 600 }} className="display">Real results</div>
              <h2 className="display" style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 800, letterSpacing: '-0.5px', margin: 0 }}>
                What people are saying
              </h2>
            </div>
          </FadeIn>
          <div style={{ maxWidth: 860, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
            {testimonials.map((t, i) => (
              <FadeIn key={i} delay={i * 100}>
                <div className="testi-card" style={{ padding: 28 }}>
                  {/* result badge */}
                  <div style={{
                    display: 'inline-block', background: 'rgba(245,197,24,0.1)',
                    border: '1px solid rgba(245,197,24,0.25)',
                    borderRadius: 100, padding: '4px 14px', fontSize: 12,
                    color: 'var(--gold)', fontWeight: 700, marginBottom: 20,
                  }} className="display">
                    {t.stat}
                  </div>
                  <p style={{ fontSize: 15, color: '#ccc', lineHeight: 1.7, margin: '0 0 20px', fontStyle: 'italic' }}>
                    "{t.quote}"
                  </p>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{t.detail}</div>
                </div>
              </FadeIn>
            ))}
          </div>
        </section>

        {/* ── CTA ────────────────────────────────────────────────── */}
        <section style={{ padding: '60px 24px 100px' }}>
          <FadeIn>
            <div style={{
              maxWidth: 640, margin: '0 auto', textAlign: 'center',
              background: 'var(--surface)',
              border: '1px solid rgba(245,197,24,0.18)',
              borderRadius: 28, padding: '56px 40px',
              boxShadow: '0 0 80px rgba(245,197,24,0.06)',
              position: 'relative', overflow: 'hidden',
            }}>
              {/* glow accent */}
              <div style={{
                position: 'absolute', top: -60, left: '50%', transform: 'translateX(-50%)',
                width: 300, height: 160,
                background: 'radial-gradient(ellipse, rgba(245,197,24,0.15) 0%, transparent 70%)',
                pointerEvents: 'none',
              }} />
              <h2 className="display" style={{ fontSize: 'clamp(26px, 4vw, 38px)', fontWeight: 800, letterSpacing: '-0.5px', margin: '0 0 16px', position: 'relative' }}>
                Start your body recomposition today
              </h2>
              <p style={{ fontSize: 16, color: 'var(--muted)', margin: '0 0 36px', lineHeight: 1.6, position: 'relative' }}>
                Get a macro-precise plan built around Indian food — no templates, no guesswork.
              </p>
              <Link href="/login" className="btn-gold" style={{ padding: '16px 40px', fontSize: 17, textDecoration: 'none', display: 'inline-block', position: 'relative' }}>
                Build my free plan
              </Link>
              <p style={{ fontSize: 12, color: 'var(--faint)', marginTop: 20 }}>No credit card · No passwords · Cancel anytime</p>
            </div>
          </FadeIn>
        </section>

        {/* ── FOOTER ─────────────────────────────────────────────── */}
        <footer style={{ borderTop: '1px solid var(--border)', padding: '28px 24px', textAlign: 'center', fontSize: 13, color: 'var(--faint)' }}>
          <div className="display" style={{ fontWeight: 700, marginBottom: 8, color: 'var(--muted)' }}>
            Aapka<span style={{ color: 'var(--gold)' }}>Coach</span>
          </div>
          <p style={{ margin: 0 }}>
            © {new Date().getFullYear()} AapkaCoach — Built for Indian bodies, by people who understand.
          </p>
          <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--faint)' }}>
            🇮🇳 Made in India by <span style={{ color: 'var(--muted)' }}>Abhinav Gupta</span>
          </p>
        </footer>

      </div>
    </>
  )
}