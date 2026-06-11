import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FRONTEND_ORIGIN = Deno.env.get("FRONTEND_ORIGIN") || "*";
const corsHeaders = {
  "Access-Control-Allow-Origin": FRONTEND_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// ---------- HELPERS ----------
function safeNum(val: unknown, fallback = 0): number {
  const n = Number(val);
  return isFinite(n) && n > 0 ? n : fallback;
}
function sanitizeField(val: unknown): string {
  if (val == null) return "Not specified";
  return String(val).replace(/[\r\n`<>]/g, " ").trim().slice(0, 200);
}
async function hashTokenDeno(token: string): Promise<string> {
  const enc = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}
function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

// ---------- JSON PARSER ----------
function safeParseJSON(raw: string): Record<string, unknown> | null {
  try { return JSON.parse(raw); } catch { /* noop */ }
  const cleaned = raw.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  try { return JSON.parse(cleaned); } catch { /* noop */ }
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    try { return JSON.parse(cleaned.substring(start, end + 1)); } catch { /* noop */ }
  }
  const aggressiveStart = raw.replace(/[\s\S]*?({)/, "$1");
  const aggressiveEnd = aggressiveStart.replace(/(})[\s\S]*$/, "$1");
  try { return JSON.parse(aggressiveEnd); } catch { /* noop */ }
  return null;
}

// ---------- DEEPSEEK CALL ----------
async function callDeepSeek(prompt: string, maxTokens = 3500, temperature = 0.25) {
  const key = Deno.env.get("DEEPSEEK_API_KEY");
  if (!key) throw new Error("Missing DEEPSEEK_API_KEY");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55_000);

  try {
    const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: "You are an expert fitness coach. Return ONLY valid JSON. No text before or after the JSON. No markdown." },
          { role: "user", content: prompt },
        ],
        temperature,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`DeepSeek HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    return {
      content: data.choices?.[0]?.message?.content || null,
      truncated: data.choices?.[0]?.finish_reason === "length",
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ---------- FALLBACKS ----------
function getFallbackWorkout(profile: Record<string, unknown>): any {
  const goal = String(profile.primary_goal || "fat_loss").toLowerCase();
  const isMuscle = goal.includes("muscle") || goal.includes("bulk") || goal.includes("gain");

  return {
    frequency: "5 sessions per week",
    philosophy: isMuscle
      ? "Progressive overload compound movements with sufficient volume for hypertrophy. Nutrition is the key driver — hit your protein target daily."
      : "Caloric deficit maintained through diet; training preserves muscle mass and accelerates fat loss via metabolic conditioning.",
    sessions: [
      {
        day: "Monday",
        type: "Strength",
        focus: "Full Body Compound",
        duration_min: 45,
        warm_up: ["Jumping jacks: 60 seconds", "Hip circles: 30 seconds each side", "Bodyweight squats: 10 reps"],
        exercises: [
          { name: "Barbell Squat / Goblet Squat", sets: 4, reps: isMuscle ? "8-10" : "12-15", rest_sec: 90, tip: "Drive knees out and chest up throughout." },
          { name: "Push-ups / Bench Press", sets: 3, reps: isMuscle ? "10-12" : "15", rest_sec: 60, tip: "Control the descent — 2 seconds down." },
          { name: "Dumbbell Row", sets: 3, reps: "12 each side", rest_sec: 60, tip: "Elbow drives back, not up — feel the lat." },
          { name: "Overhead Press", sets: 3, reps: "10-12", rest_sec: 60, tip: "Brace your core to protect lower back." },
          { name: "Plank", sets: 3, reps: "30-45 seconds", rest_sec: 45, tip: "Posterior pelvic tilt — don't let hips sag." },
        ],
        cool_down: ["Standing quad stretch: 30s each side", "Child's pose: 60 seconds", "Shoulder cross-body stretch: 20s each side"],
      },
      {
        day: "Tuesday",
        type: "HIIT Cardio",
        focus: "Metabolic Conditioning",
        duration_min: 30,
        warm_up: ["March in place: 60 seconds", "Leg swings: 10 each side", "Arm swings: 20 reps"],
        exercises: [
          { name: "Burpees", sets: 4, reps: "30s work / 20s rest", rest_sec: 20, tip: "Land softly to protect knees." },
          { name: "Mountain Climbers", sets: 4, reps: "30s work / 20s rest", rest_sec: 20, tip: "Keep hips level — don't bounce." },
          { name: "High Knees", sets: 4, reps: "30s work / 20s rest", rest_sec: 20, tip: "Drive arms for full body engagement." },
          { name: "Jump Squats", sets: 4, reps: "30s work / 20s rest", rest_sec: 20, tip: "Land heel-to-toe to absorb impact." },
        ],
        cool_down: ["Slow walk: 3 minutes", "Hip flexor stretch: 30s each", "Forward fold: 60 seconds"],
        cardio_note: "Maintain 75–85% max heart rate during work intervals. Max HR ≈ 220 - age.",
      },
      {
        day: "Thursday",
        type: "Strength",
        focus: "Lower Body",
        duration_min: 45,
        warm_up: ["Hip circles: 10 each direction", "Glute bridges: 15 reps", "Lateral band walks: 15 each side"],
        exercises: [
          { name: "Romanian Deadlift", sets: 4, reps: isMuscle ? "8-10" : "12", rest_sec: 90, tip: "Hinge at hips — feel the hamstring stretch." },
          { name: "Lunges (Alternating)", sets: 3, reps: "12 each leg", rest_sec: 60, tip: "Front knee stays over ankle, not past toes." },
          { name: "Leg Press / Wall Sit", sets: 3, reps: isMuscle ? "10" : "45 seconds", rest_sec: 75, tip: "Full range of motion for maximum muscle activation." },
          { name: "Calf Raises", sets: 3, reps: "20", rest_sec: 45, tip: "Pause at top for 1 second to maximize contraction." },
          { name: "Glute Bridge", sets: 3, reps: "15", rest_sec: 45, tip: "Squeeze glutes hard at the top for 2 seconds." },
        ],
        cool_down: ["Standing hamstring stretch: 30s each", "Pigeon pose: 45s each", "Calf doorway stretch: 30s each"],
      },
      {
        day: "Friday",
        type: "Strength",
        focus: "Upper Body Push + Pull",
        duration_min: 50,
        warm_up: ["Band pull-aparts: 15 reps", "Shoulder dislocations (band): 10 reps", "Push-ups: 10 reps"],
        exercises: [
          { name: "Dumbbell Bench Press", sets: 4, reps: isMuscle ? "10-12" : "12-15", rest_sec: 75, tip: "Retract shoulder blades before pressing." },
          { name: "Bent-Over Row", sets: 4, reps: "10-12", rest_sec: 75, tip: "Neutral spine — don't round the lower back." },
          { name: "Lateral Raises", sets: 3, reps: "15", rest_sec: 45, tip: "Slight forward lean isolates the medial delt." },
          { name: "Face Pulls / Band Rows", sets: 3, reps: "15", rest_sec: 45, tip: "External rotation at the end improves posture." },
          { name: "Tricep Dips / Pushdowns", sets: 3, reps: "12", rest_sec: 45, tip: "Lock elbows at sides for strict tricep isolation." },
        ],
        cool_down: ["Chest stretch on wall: 30s each", "Lat stretch hanging or overhead: 30s", "Wrist flexor / extensor stretch: 20s each"],
      },
      {
        day: "Saturday",
        type: "Active Recovery",
        focus: "Mobility + Low Intensity",
        duration_min: 35,
        warm_up: ["Slow neck rolls: 30s", "Torso twists: 10 each side", "Ankle circles: 10 each"],
        exercises: [
          { name: "Yoga Sun Salutation (Surya Namaskar)", sets: 3, reps: "5 rounds", rest_sec: 30, tip: "Focus on breath — inhale extend, exhale fold." },
          { name: "Hip 90/90 Stretch", sets: 2, reps: "60s each side", rest_sec: 0, tip: "Sit tall, don't let the back round." },
          { name: "Thoracic Rotation", sets: 2, reps: "10 each side", rest_sec: 0, tip: "Keep hips still, rotate only from mid-back." },
          { name: "Foam Roll: Quads + IT Band + Upper Back", sets: 1, reps: "90 seconds each area", rest_sec: 0, tip: "Pause on tender spots for 10–15 seconds." },
        ],
        cool_down: ["Supine spinal twist: 45s each side", "Legs-up-the-wall: 3 minutes", "Savasana: 2 minutes"],
      },
    ],
    progressive_overload_note: `Add 2.5kg to compound lifts (squat, deadlift, bench, row) every 1–2 weeks when you complete all prescribed reps with good form across all sets. For bodyweight exercises, increase reps by 2 per set, or add a weighted vest.`,
    weekly_schedule_summary: [
      "Monday: Full Body Strength",
      "Tuesday: HIIT Cardio (30 min)",
      "Wednesday: REST — Walk 8,000 steps",
      "Thursday: Lower Body Strength",
      "Friday: Upper Body Strength",
      "Saturday: Active Recovery / Mobility",
      "Sunday: REST — Light walk only",
    ],
    rest_day_activity: "8,000-step walk + 10-min gentle stretching — avoid complete inactivity on rest days.",
  };
}

function getFallbackLifestyle(): any {
  return {
    sleep_hours: "7–8 hours; aim for 10:00–10:30 PM bedtime for optimal growth hormone release",
    water_liters: "3–3.5 liters/day; extra 500ml on workout days; sip water before each meal",
    daily_steps: "8,000–10,000 steps daily; use stairs, walk after meals, park farther away",
    stress_management: [
      "4-7-8 breathing technique: inhale 4 seconds, hold 7 seconds, exhale 8 seconds — repeat 4 cycles",
      "10-minute morning journaling: write 3 things you're grateful for + 1 goal for the day",
      "Screen-free hour before bed — replace with reading, light stretching, or meditation",
      "Progressive muscle relaxation at bedtime: tense each muscle group for 5 seconds then release",
    ],
    avoid_list: [
      "Sugary drinks, soft drinks, packaged juices — liquid calories with zero nutrition",
      "Deep-fried foods (samosas, bhajias, pakoras) — extremely calorie-dense, easy to overeat",
      "Maida-based foods (white bread, naan, biscuits) — rapid blood sugar spikes",
      "Alcohol — disrupts sleep architecture, inhibits fat oxidation for 24–48 hours",
      "Skipping meals, especially breakfast — leads to compensatory overeating",
      "Eating while distracted (TV, phone) — reduces satiety signals by 25–30%",
      "High-sodium packaged snacks (chips, mixtures) — causes water retention",
      "Late-night heavy meals after 9 PM — digestive stress and poor sleep quality",
    ],
    recovery_tips: [
      "Foam roll major muscle groups (quads, hamstrings, back) for 5 minutes post-workout",
      "Contrast showers after leg day: 1 minute cold, 1 minute warm, repeat 3–4 cycles",
      "Elevate legs against a wall (Viparita Karani) for 10 minutes on rest days to reduce soreness",
      "Consume 20–30g fast-digesting protein (curd, paneer, eggs) within 30–45 minutes post-workout",
    ],
    supplement_suggestions: [
      "Creatine monohydrate: 3–5g daily (any time) — most evidence-backed supplement for strength and muscle",
      "Vitamin D3: 60,000 IU once weekly or 2000 IU daily — over 70% of Indians are deficient",
      "Omega-3 fatty acids: 1g fish oil or 1 tbsp flaxseed oil daily — reduces inflammation and aids fat loss",
      "Magnesium glycinate: 300mg at bedtime — improves sleep quality and muscle recovery",
    ],
    habit_tracker: [
      "Hit daily calorie target (±100 kcal)?",
      "Hit daily protein target?",
      "Completed today's scheduled workout?",
      "Drank 3+ liters of water?",
      "Slept 7+ hours last night?",
      "Walked 8,000+ steps today?",
    ],
  };
}

// ---------- MAIN HANDLER ----------
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const token = authHeader.replace("Bearer ", "").trim();
    const tokenHash = await hashTokenDeno(token);
    const { data: session } = await supabaseAdmin.from("sessions").select("user_id").eq("token_hash", tokenHash).gt("expires_at", new Date().toISOString()).maybeSingle();
    if (!session) return new Response(JSON.stringify({ error: "Invalid session" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const userId = session.user_id;

    const { data: profile } = await supabaseAdmin.from("profiles").select("*").eq("user_id", userId).single();
    if (!profile) return new Response(JSON.stringify({ error: "Profile not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: latestPlan } = await supabaseAdmin.from("meal_plans").select("*").eq("user_id", userId).order("generated_at", { ascending: false }).limit(1).maybeSingle();
    if (!latestPlan) return new Response(JSON.stringify({ error: "No diet plan found – generate diet first" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Build workout prompt
    const goal = String(profile.primary_goal || "fat_loss");
    const workoutPrompt = `Generate a detailed 5-day/week workout plan + comprehensive lifestyle rules for a ${goal} goal. Weight: ${safeNum(profile.weight_kg)}kg, BF: ${safeNum(profile.body_fat_percent)}%, Activity: ${sanitizeField(profile.activity_level)}. Include warm-ups, exercises with sets/reps/rest/tips, cool-downs, and all lifestyle rules. Return ONLY valid JSON with keys workout_plan and lifestyle_rules.`;

    let workoutPlan = getFallbackWorkout(profile);
    let lifestyleRules = getFallbackLifestyle();

    try {
      const result = await callDeepSeek(workoutPrompt, 3500, 0.25);
      if (result.content) {
        const parsed = safeParseJSON(result.content);
        if (parsed) {
          if (parsed.workout_plan) workoutPlan = parsed.workout_plan;
          if (parsed.lifestyle_rules) lifestyleRules = parsed.lifestyle_rules;
        }
      }
    } catch (err) {
      console.warn("Workout AI call failed, using fallback");
    }

    // Update the plan with workout & lifestyle
    const updatedPlan = { ...(latestPlan.plan_json as any), workout_plan: workoutPlan, lifestyle_rules: lifestyleRules };
    await supabaseAdmin.from("meal_plans").update({ plan_json: updatedPlan }).eq("id", latestPlan.id);

    return new Response(JSON.stringify({ success: true, workout_plan: workoutPlan, lifestyle_rules: lifestyleRules }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});