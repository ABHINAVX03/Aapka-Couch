import Link from 'next/link'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#0c0c10] text-white font-sans selection:bg-yellow-500 selection:text-black">
      {/* -------- NAVIGATION -------- */}
      <nav className="flex items-center justify-between px-4 md:px-6 py-4 border-b border-[#222230]">
        <div className="text-2xl font-extrabold tracking-tight">
          Aapka<span className="text-yellow-500">Coach</span>
        </div>
        <Link
          href="/login"
          className="bg-yellow-500 text-black px-5 py-2 rounded-full font-semibold text-sm hover:bg-yellow-400 transition shadow-lg shadow-yellow-500/20"
        >
          Get Started
        </Link>
      </nav>

      {/* -------- HERO -------- */}
      <section className="px-4 md:px-6 py-16 md:py-24 max-w-3xl mx-auto text-center">
        <h1 className="text-4xl md:text-6xl font-extrabold leading-tight tracking-tight">
          Your AI‑Powered<br />
          <span className="text-yellow-500">Diet & Fitness Coach</span>
        </h1>
        <p className="text-gray-400 mt-6 text-lg md:text-xl max-w-xl mx-auto">
          A personal nutritionist, personal trainer, and progress tracker – all in your pocket.
          Built for Indian lifestyles, hostel‑friendly, and surprisingly affordable.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Link
            href="/login"
            className="bg-yellow-500 text-black px-8 py-3 rounded-full font-bold text-lg hover:bg-yellow-400 transition shadow-xl shadow-yellow-500/20"
          >
            Start Your Transformation
          </Link>
          <Link
            href="#how-it-works"
            className="border border-[#222230] px-8 py-3 rounded-full font-semibold text-gray-300 hover:border-yellow-500 transition"
          >
            How It Works
          </Link>
        </div>
        <div className="mt-12 flex justify-center gap-8 text-sm text-gray-500">
          <span>✅ No credit card</span>
          <span>✅ Under 2 minutes setup</span>
          <span>✅ Indian foods only</span>
        </div>
      </section>

      {/* -------- FEATURES -------- */}
      <section id="features" className="px-4 md:px-6 py-16 max-w-5xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-12">Why AapkaCoach?</h2>
        <div className="grid md:grid-cols-3 gap-8">
          {[
            {
              icon: '🧠',
              title: 'AI‑Personalized Plans',
              desc: 'DeepSeek AI crafts a 7‑day diet based on your body composition, goal, budget, and hostel‑mess constraints. No generic templates.',
            },
            {
              icon: '⏱️',
              title: 'Frictionless Login',
              desc: 'Just enter your email and a one‑time code. No passwords. No social sign‑in. Instant access on any device.',
            },
            {
              icon: '📊',
              title: 'Real Progress Tracking',
              desc: 'Log your BCA scans and see your body fat, weight, and visceral fat trend over time with beautiful charts.',
            },
            {
              icon: '🥘',
              title: '100% Indian Food',
              desc: 'From dal‑chawal to paneer bhurji, every meal is something you can actually find in your mess or cook cheaply.',
            },
            {
              icon: '📱',
              title: 'Works Like an App',
              desc: 'Add to your home screen and use it offline. Feels native, built with cutting‑edge web tech.',
            },
            {
              icon: '🔒',
              title: 'Privacy First',
              desc: 'Your health data stays encrypted. We never sell or share your information. No ads, ever.',
            },
          ].map((feature, idx) => (
            <div
              key={idx}
              className="bg-[#17171f] border border-[#222230] rounded-2xl p-6 hover:border-yellow-500/30 transition-colors"
            >
              <div className="text-3xl mb-4">{feature.icon}</div>
              <h3 className="font-bold text-lg mb-2">{feature.title}</h3>
              <p className="text-gray-400 text-sm">{feature.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* -------- HOW IT WORKS -------- */}
      <section id="how-it-works" className="px-4 md:px-6 py-16 max-w-3xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-12">Get Your Plan in 3 Steps</h2>
        <div className="space-y-10">
          {[
            {
              step: '01',
              title: 'Answer a few questions',
              desc: 'Tell us your age, weight, body fat %, activity level, and diet preferences. Takes less than 2 minutes.',
            },
            {
              step: '02',
              title: 'AI builds your plan',
              desc: 'Our engine calculates your exact calories and macros, then writes a custom 7‑day menu with Indian foods.',
            },
            {
              step: '03',
              title: 'Follow & track progress',
              desc: 'Log your daily meals and weekly BCA scans. Watch your body fat drop and health improve week by week.',
            },
          ].map((item, idx) => (
            <div key={idx} className="flex gap-6 items-start">
              <div className="text-yellow-500 text-5xl font-extrabold leading-none">{item.step}</div>
              <div>
                <h3 className="text-xl font-bold">{item.title}</h3>
                <p className="text-gray-400 mt-1">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* -------- SOCIAL PROOF -------- */}
      <section className="px-4 md:px-6 py-16 max-w-3xl mx-auto text-center">
        <h2 className="text-3xl font-bold mb-8">Trusted by fitness enthusiasts</h2>
        <div className="grid md:grid-cols-2 gap-6">
          {[
            {
              quote: 'AapkaCoach made me go from 17% to 13% body fat in 10 weeks while eating hostel food. I never thought it was possible.',
              name: 'Abhinav Gupta',
              detail: 'Student, 23 • 74kg • 178cm',
            },
            {
              quote: 'I tried a dozen diet apps. This is the only one that understands Indian meals and doesn’t ask me to eat avocado toast.',
              name: 'Riya S.',
              detail: 'Working professional, 28',
            },
          ].map((testimonial, idx) => (
            <div
              key={idx}
              className="bg-[#17171f] border border-[#222230] rounded-2xl p-6 text-left"
            >
              <p className="text-gray-300 italic">“{testimonial.quote}”</p>
              <div className="mt-4 font-semibold">{testimonial.name}</div>
              <div className="text-xs text-gray-500 mt-1">{testimonial.detail}</div>
            </div>
          ))}
        </div>
      </section>

      {/* -------- CTA -------- */}
      <section className="px-4 md:px-6 py-20 text-center">
        <div className="max-w-xl mx-auto bg-gradient-to-br from-yellow-500/10 to-transparent border border-yellow-500/20 rounded-3xl p-8 md:p-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Ready to transform your body?
          </h2>
          <p className="text-gray-400 mb-8">
            Join hundreds of users who are losing fat, building muscle, and understanding their nutrition — without leaving their hostel.
          </p>
          <Link
            href="/login"
            className="inline-block bg-yellow-500 text-black px-10 py-4 rounded-full font-bold text-lg hover:bg-yellow-400 transition shadow-xl shadow-yellow-500/20"
          >
            Start Free
          </Link>
          <p className="text-xs text-gray-500 mt-4">No credit card required. Cancel anytime.</p>
        </div>
      </section>

      {/* -------- FOOTER -------- */}
      <footer className="border-t border-[#222230] px-4 md:px-6 py-8 text-center text-gray-600 text-sm">
        <p>AapkaCoach © {new Date().getFullYear()} — Built for Indian bodies, by people who understand.</p>
      </footer>
    </div>
  )
}