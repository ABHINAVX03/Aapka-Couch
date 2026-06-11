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

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

interface MacroTargets {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  tdee: number;
  bmr: number;
  deficit_surplus_kcal: number;
  deficit_surplus_note: string;
  weekly_weight_change_kg: number;
}

interface WorkoutSession {
  day: string;
  type: string;
  focus: string;
  duration_min: number;
  warm_up: string[];
  exercises: ExerciseItem[];
  cool_down: string[];
  cardio_note?: string;
}

interface ExerciseItem {
  name: string;
  sets: number;
  reps: string;
  rest_sec: number;
  tip: string;
}

interface LifestyleRules {
  sleep_hours: string;
  water_liters: string;
  daily_steps: string;
  stress_management: string[];
  avoid_list: string[];
  recovery_tips: string[];
  supplement_suggestions: string[];
  habit_tracker: string[];
}

interface WorkoutPlan {
  frequency: string;
  philosophy: string;
  sessions: WorkoutSession[];
  progressive_overload_note: string;
  weekly_schedule_summary: string[];
  rest_day_activity: string;
}

interface FoodItem {
  name: string;
  quantity: string;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  kcal: number;
  cost_inr: number;
}

interface Meal {
  time: string;
  name: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  foods: FoodItem[];
  tip: string;
  prep_time_min: number;
}

interface DayPlan {
  day: string;
  type: string;
  total_kcal: number;
  total_protein_g: number;
  total_carbs_g: number;
  total_fat_g: number;
  meals: Meal[];
  hydration_reminder: string;
  daily_note: string;
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

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
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

// ─────────────────────────────────────────────
// NUTRITION SCIENCE ENGINE (Server-side, never AI)
// ─────────────────────────────────────────────

function calcMacros(profile: Record<string, unknown>): MacroTargets {
  const weightKg = safeNum(profile.weight_kg, 70);
  const heightCm = safeNum(profile.height_cm, 170);
  const age = safeNum(profile.age, 30);
  const sex = String(profile.sex || "male").toLowerCase();
  const bodyFatPct = clamp(safeNum(profile.body_fat_percent, 20), 5, 55);
  const activityLevel = String(profile.activity_level || "moderate").toLowerCase();
  const goal = String(profile.primary_goal || "fat_loss").toLowerCase();
  const mealCount = clamp(safeNum(profile.meal_count, 4), 3, 5);
  const dailyBudget = safeNum(profile.daily_budget, 150);
  const dietPattern = String(profile.dietary_pattern || "vegetarian").toLowerCase();
  const isVeg = !dietPattern.includes("non");

  // ── 1. Mifflin-St Jeor BMR ──────────────────
  const bmr = sex === "female"
    ? 10 * weightKg + 6.25 * heightCm - 5 * age - 161
    : 10 * weightKg + 6.25 * heightCm - 5 * age + 5;

  // ── 2. TDEE with PAL ────────────────────────
  const activityMap: [string, number][] = [
    ["sedentary", 1.2],
    ["light", 1.375],
    ["lightly_active", 1.375],
    ["moderate", 1.55],
    ["moderately", 1.55],
    ["active", 1.725],
    ["very_active", 1.725],
    ["extra_active", 1.9],
  ];
  let pal = 1.55;
  for (const [key, val] of activityMap) {
    if (activityLevel.includes(key.replace("_", ""))) { pal = val; break; }
  }
  const tdee = Math.round(bmr * pal);

  // ── 3. Lean Body Mass ───────────────────────
  const lbm = weightKg * (1 - bodyFatPct / 100);

  // ── 4. Goal-based calorie target ────────────
  let targetCalories: number;
  let deficitSurplusKcal = 0;
  let deficitSurplusNote: string;
  let weeklyWeightChangeKg: number;

  const isFatLoss = goal.includes("fat") || goal.includes("loss") || goal.includes("cut") || goal.includes("weight");
  const isMuscle = goal.includes("muscle") || goal.includes("bulk") || goal.includes("gain") || goal.includes("mass");

  if (isFatLoss) {
    // Aggressive but safe: 20–22% deficit. Never below safe floors.
    const deficit = Math.round(tdee * 0.22);
    const minCals = sex === "female" ? 1200 : 1400;
    targetCalories = Math.max(tdee - deficit, minCals);
    deficitSurplusKcal = -(tdee - targetCalories);
    weeklyWeightChangeKg = -(Math.abs(deficitSurplusKcal) * 7) / 7700;
    deficitSurplusNote = `Fat loss: ${tdee - targetCalories} kcal/day deficit from TDEE (${tdee} kcal). Expect ~${Math.abs(weeklyWeightChangeKg).toFixed(2)} kg/week loss.`;
  } else if (isMuscle) {
    // Conservative lean bulk: 10–12% surplus
    const surplus = Math.round(tdee * 0.11);
    targetCalories = tdee + surplus;
    deficitSurplusKcal = surplus;
    weeklyWeightChangeKg = (surplus * 7) / 7700;
    deficitSurplusNote = `Lean bulk: ${surplus} kcal/day surplus above TDEE (${tdee} kcal). Expect ~${weeklyWeightChangeKg.toFixed(2)} kg/week gain.`;
  } else {
    // Recomposition / maintenance
    targetCalories = tdee;
    deficitSurplusKcal = 0;
    weeklyWeightChangeKg = 0;
    deficitSurplusNote = `Body recomposition at maintenance TDEE (${tdee} kcal). Focus on building muscle while slowly losing fat.`;
  }

  // ── 5. Protein (evidence-based, realistic for Indian diet) ──
  let proteinPerKgLBM = isFatLoss ? 1.8 : isMuscle ? 2.0 : 1.7;

  // Indian vegetarian proteins are 60–70% as bioavailable; scale up slightly
  // but keep ceiling realistic for home cooking
  if (isVeg) proteinPerKgLBM = Math.min(proteinPerKgLBM, 1.7);
  // Budget constraint — <₹100/day limits high-protein foods
  if (dailyBudget < 100) proteinPerKgLBM *= 0.82;

  // Hard ceilings: max 35% of calories from protein, max 25g per meal
  const maxProteinFromCalories = Math.floor((targetCalories * 0.35) / 4);
  const mealProteinCeiling = mealCount * 25;
  let proteinG = Math.min(
    Math.round(lbm * proteinPerKgLBM),
    maxProteinFromCalories,
    mealProteinCeiling
  );
  proteinG = Math.max(proteinG, 50); // never below 50g

  // ── 6. Fat (hormone health minimum) ─────────
  const fatG = clamp(Math.round(weightKg * 0.8), 45, 100);

  // ── 7. Carbs (fill remaining calories) ──────
  const proteinCals = proteinG * 4;
  const fatCals = fatG * 9;
  const carbCals = targetCalories - proteinCals - fatCals;
  const carbsG = Math.max(Math.round(carbCals / 4), 50);

  // ── 8. Fiber (25-38g/day target) ────────────
  const fiberG = clamp(Math.round(carbsG * 0.12), 18, 38);

  // Recalc true calories
  const actualCalories = (proteinG * 4) + (fatG * 9) + (carbsG * 4);

  return {
    calories: actualCalories,
    protein_g: proteinG,
    carbs_g: carbsG,
    fat_g: fatG,
    fiber_g: fiberG,
    tdee,
    bmr: Math.round(bmr),
    deficit_surplus_kcal: deficitSurplusKcal,
    deficit_surplus_note: deficitSurplusNote,
    weekly_weight_change_kg: Math.round(weeklyWeightChangeKg * 100) / 100,
  };
}

// ─────────────────────────────────────────────
// VALIDATION
// ─────────────────────────────────────────────

function validateDietPlan(p: unknown): { valid: boolean; reason?: string } {
  if (!p || typeof p !== "object") return { valid: false, reason: "Plan is not an object" };
  const plan = p as Record<string, unknown>;

  const dm = plan.daily_macros as Record<string, unknown>;
  if (!dm || typeof dm !== "object") return { valid: false, reason: "Missing daily_macros" };
  for (const k of ["calories", "protein_g", "carbs_g", "fat_g"]) {
    if (typeof dm[k] !== "number" || !isFinite(dm[k] as number))
      return { valid: false, reason: `daily_macros.${k} is invalid` };
  }

  if (!Array.isArray(plan.weekly_meals) || (plan.weekly_meals as unknown[]).length < 6)
    return { valid: false, reason: `weekly_meals has only ${(plan.weekly_meals as unknown[])?.length ?? 0} days (need ≥6)` };

  for (const day of plan.weekly_meals as unknown[]) {
    const d = day as Record<string, unknown>;
    if (!d || !Array.isArray(d.meals) || (d.meals as unknown[]).length === 0)
      return { valid: false, reason: `Day "${(d as Record<string, unknown>)?.day}" has no meals` };
    for (const meal of d.meals as unknown[]) {
      const m = meal as Record<string, unknown>;
      if (!m || !Array.isArray(m.foods) || (m.foods as unknown[]).length === 0)
        return { valid: false, reason: `Meal "${m?.name}" has no foods` };
    }
  }
  return { valid: true };
}

function validateWorkoutPlan(p: unknown): boolean {
  if (!p || typeof p !== "object") return false;
  const plan = p as Record<string, unknown>;
  return Array.isArray(plan.sessions) && (plan.sessions as unknown[]).length >= 3;
}

// ─────────────────────────────────────────────
// AI CALL — with retry logic
// ─────────────────────────────────────────────

interface DeepSeekResult {
  truncated: boolean;
  content: string | null;
  tokensUsed?: number;
}

async function callDeepSeek(
  prompt: string,
  maxTokens: number,
  temperature = 0.25,
  retries = 1
): Promise<DeepSeekResult> {
  const deepseekKey = Deno.env.get("DEEPSEEK_API_KEY");
  if (!deepseekKey) throw new Error("Missing DEEPSEEK_API_KEY env var");

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 58_000);

    try {
      const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${deepseekKey}`,
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [
            {
              role: "system",
              content:
                "You are an expert Indian dietitian, sports nutritionist, and certified fitness coach with 15+ years of experience. You create precise, culturally authentic, affordable Indian meal plans and workout programs. Respond ONLY with valid JSON. No markdown fences, no explanation text, no backticks — pure JSON only.",
            },
            { role: "user", content: prompt },
          ],
          temperature: temperature + attempt * 0.05, // slight increase on retry
          max_tokens: maxTokens,
          response_format: { type: "json_object" },
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const errText = await res.text();
        if (attempt < retries) {
          console.warn(`DeepSeek HTTP ${res.status} on attempt ${attempt + 1}, retrying...`);
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }
        throw new Error(`DeepSeek HTTP ${res.status}: ${errText.slice(0, 300)}`);
      }

      const data = await res.json();
      const choice = data.choices?.[0];

      return {
        truncated: choice?.finish_reason === "length",
        content: choice?.message?.content || null,
        tokensUsed: data.usage?.total_tokens,
      };
    } catch (err) {
      clearTimeout(timeout);
      if (attempt < retries) {
        console.warn(`DeepSeek call failed on attempt ${attempt + 1}:`, (err as Error).message);
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      throw err;
    }
  }

  return { truncated: false, content: null };
}

// ─────────────────────────────────────────────
// PROMPT BUILDER — DIET (Increased tokens, richer prompt)
// ─────────────────────────────────────────────

function buildDietPrompt(
  profile: Record<string, unknown>,
  macros: MacroTargets,
  foodType: string,
  mealCount: number,
  notes: string
): string {
  const perMealProtein = Math.round(macros.protein_g / mealCount);
  const perMealCalories = Math.round(macros.calories / mealCount);
  const budget = safeNum(profile.daily_budget, 150);
  const perMealBudget = Math.round(budget / mealCount);
  const dietPattern = String(profile.dietary_pattern || "vegetarian").toLowerCase();
  const isVeg = !dietPattern.includes("non");
  const isEggVeg = dietPattern.includes("egg") || dietPattern.includes("eggetarian");
  const goal = String(profile.primary_goal || "fat_loss").toLowerCase();
  const weightKg = safeNum(profile.weight_kg, 70);
  const allergies = sanitizeField(profile.allergies || profile.food_allergies || "None");
  const medicalConditions = sanitizeField(profile.medical_conditions || "None");
  const state = sanitizeField(profile.state || profile.city || "India");

  const mealSlots: Record<number, string[]> = {
    3: ["8:00 AM", "1:30 PM", "8:30 PM"],
    4: ["7:30 AM", "12:30 PM", "4:30 PM", "8:30 PM"],
    5: ["7:00 AM", "10:30 AM", "1:00 PM", "4:30 PM", "8:00 PM"],
  };
  const slots = mealSlots[mealCount] || mealSlots[4];

  let proteinSources: string;
  if (isEggVeg) {
    proteinSources = "EGGETARIAN: eggs (boiled, scrambled, omelette), paneer, curd, dal, soya chunks, tofu, rajma, chana, moong, besan, milk, cheese";
  } else if (isVeg) {
    proteinSources = "VEGETARIAN ONLY: paneer, curd, dal (moong, masoor, toor, chana, urad), soya chunks, tofu, rajma, chana, besan (gram flour), milk, cheese, makhana, quinoa";
  } else {
    proteinSources = "NON-VEG allowed: chicken breast, eggs, fish (rohu, surmai, tilapia), paneer, curd, dal, soya chunks, rajma";
  }

  const cuisineNote = foodType === "south_indian"
    ? "Use South Indian foods: idli, dosa, sambar, rasam, upma, pongal, kozhukattai, curd rice, fish curry, egg curry"
    : foodType === "punjabi" || foodType === "north_indian"
      ? "Use North Indian/Punjabi foods: roti, paratha, rajma, dal makhani, paneer dishes, lassi, chole"
      : "Use balanced pan-Indian foods: roti, dal, sabzi, rice dishes, idli, poha, upma, curd, salad";

  return `You are generating a COMPLETE 7-day Indian diet plan (Monday to Sunday). The macro targets below are SCIENTIFICALLY CALCULATED — do NOT modify the daily_macros values in your response.

═══════════════════════════════
FIXED DAILY MACRO TARGETS
═══════════════════════════════
Calories : ${macros.calories} kcal  (TDEE: ${macros.tdee} kcal)
Protein  : ${macros.protein_g}g  (~${perMealProtein}g per meal)
Carbs    : ${macros.carbs_g}g
Fat      : ${macros.fat_g}g
Fiber    : ${macros.fiber_g}g (minimum)
Goal note: ${macros.deficit_surplus_note}

═══════════════════════════════
USER PROFILE
═══════════════════════════════
Goal      : ${sanitizeField(profile.primary_goal)}
Weight    : ${weightKg}kg  |  Height: ${safeNum(profile.height_cm)}cm
Body Fat  : ${safeNum(profile.body_fat_percent)}%
Diet type : ${dietPattern}
Region    : ${state}
Budget    : ₹${budget}/day  (₹${perMealBudget} per meal)
Meals/day : ${mealCount}
Allergies : ${allergies}
Medical   : ${medicalConditions}
Food type : ${foodType}
${notes ? `Special notes: ${notes}` : ""}

═══════════════════════════════
DIETARY RULES
═══════════════════════════════
PROTEIN SOURCES (only use these): ${proteinSources}
CUISINE: ${cuisineNote}
- Every meal MUST contain at least 1 protein source listed above
- Use STANDARD INDIAN FOOD COMPOSITION TABLE values (ICMR data)
- Portion sizes must be household-realistic:
    • Roti = 30g each  |  Paratha = 60g each
    • Cooked rice = 150g per cup  |  Dal cooked = 150ml per serving
    • Paneer = 100g per serving  |  Curd = 150g per katori
    • Soya chunks (dry) = 30g per serving  |  Eggs = 55g each
- Budget-friendly: prioritize dal, eggs, curd, seasonal vegetables, whole grains
- NO protein powder or supplements unless profile explicitly mentions them
- Vary protein source each meal — no same dish on consecutive days
- Include at least 2 dal/legume meals per day for vegetarians

═══════════════════════════════
MEAL STRUCTURE
═══════════════════════════════
Meal times: ${slots.join("  |  ")}
Each meal target: ~${perMealCalories} kcal ± 8%  |  ~${perMealProtein}g protein
Include fiber-rich foods: vegetables, dal, fruits, whole grains
Include 1 practical cooking tip per meal (under 20 words)
Include prep time per meal (in minutes)

═══════════════════════════════
WEEK VARIETY GUIDELINES
═══════════════════════════════
- Breakfast variety: rotate between poha, upma, idli, moong dal chilla, besan chilla, oats, paratha (stuffed), egg dishes
- Lunch variety: rotate between dal-roti, rajma-rice, chole-rice, paneer sabzi, khichdi, dal-khichdi
- Dinner variety: lighter than lunch — soups, dal, sabzi with roti, curd rice
- Snacks (if 4-5 meals): makhana, roasted chana, fruits, sprouts, curd, buttermilk, boiled eggs

═══════════════════════════════
RESPONSE FORMAT (strict JSON)
═══════════════════════════════
{
  "daily_macros": {
    "calories": ${macros.calories},
    "protein_g": ${macros.protein_g},
    "carbs_g": ${macros.carbs_g},
    "fat_g": ${macros.fat_g},
    "fiber_g": ${macros.fiber_g}
  },
  "weekly_meals": [
    {
      "day": "Monday",
      "type": "standard",
      "total_kcal": <sum of all meals>,
      "total_protein_g": <sum>,
      "total_carbs_g": <sum>,
      "total_fat_g": <sum>,
      "hydration_reminder": "Drink a glass of water before each meal",
      "daily_note": "Focus on hitting protein target today",
      "meals": [
        {
          "time": "${slots[0]}",
          "name": "Moong Dal Chilla with Curd",
          "kcal": 420,
          "protein_g": ${perMealProtein},
          "carbs_g": 45,
          "fat_g": 12,
          "fiber_g": 5,
          "prep_time_min": 15,
          "foods": [
            {
              "name": "Moong Dal Chilla",
              "quantity": "3 pieces (90g batter)",
              "protein_g": 14,
              "carbs_g": 30,
              "fat_g": 7,
              "fiber_g": 3,
              "kcal": 250,
              "cost_inr": 18
            },
            {
              "name": "Low-fat Curd",
              "quantity": "150g (1 katori)",
              "protein_g": 5,
              "carbs_g": 8,
              "fat_g": 3,
              "fiber_g": 0,
              "kcal": 75,
              "cost_inr": 8
            },
            {
              "name": "Green Chutney",
              "quantity": "2 tbsp (30g)",
              "protein_g": 1,
              "carbs_g": 3,
              "fat_g": 1,
              "fiber_g": 1,
              "kcal": 20,
              "cost_inr": 3
            }
          ],
          "tip": "Add grated paneer to batter for extra protein boost."
        }
      ]
    }
  ]
}

GENERATE ALL 7 DAYS (Monday through Sunday). Verify per-day totals approximately match: ${macros.calories} kcal, ${macros.protein_g}g protein.`;
}

// ─────────────────────────────────────────────
// PROMPT BUILDER — WORKOUT (Dedicated, comprehensive)
// ─────────────────────────────────────────────

function buildWorkoutPrompt(profile: Record<string, unknown>, macros: MacroTargets): string {
  const goal = String(profile.primary_goal || "fat_loss").toLowerCase();
  const activity = String(profile.activity_level || "moderate").toLowerCase();
  const bf = safeNum(profile.body_fat_percent, 20);
  const weightKg = safeNum(profile.weight_kg, 70);
  const age = safeNum(profile.age, 30);
  const sex = String(profile.sex || "male").toLowerCase();
  const injuries = sanitizeField(profile.injuries || profile.medical_conditions || "None");
  const gymAccess = String(profile.gym_access || profile.equipment || "gym").toLowerCase();
  const hasGym = !gymAccess.includes("no") && !gymAccess.includes("home");
  const experience = String(profile.fitness_experience || profile.experience || "beginner").toLowerCase();

  const isFatLoss = goal.includes("fat") || goal.includes("loss") || goal.includes("cut") || goal.includes("weight");
  const isMuscle = goal.includes("muscle") || goal.includes("bulk") || goal.includes("gain") || goal.includes("mass");

  const equipmentNote = hasGym
    ? "Full gym access: barbells, dumbbells, cables, machines"
    : "Home/minimal equipment: bodyweight, resistance bands, dumbbells (optional)";

  const sessionFocus = isFatLoss
    ? "Emphasis on compound lifts (preserves muscle) + HIIT cardio. Higher rep ranges (12–15). Circuit-style to keep heart rate elevated."
    : isMuscle
      ? "Emphasis on progressive overload compound lifts (bench, squat, deadlift, rows). Rep range 6–12. Minimal cardio (2x low-intensity)."
      : "Balanced strength + moderate cardio. Rep range 8–15. 3-4 strength + 1–2 cardio sessions.";

  return `Generate a DETAILED 5-day/week workout plan + comprehensive lifestyle rules for this user.

═══════════════════════════════
USER PROFILE
═══════════════════════════════
Goal         : ${sanitizeField(profile.primary_goal)}
Age/Sex      : ${age}y / ${sex}
Weight       : ${weightKg}kg  |  Body Fat: ${bf}%
Activity     : ${activity}
Experience   : ${experience}
Equipment    : ${equipmentNote}
Injuries     : ${injuries}
TDEE         : ${macros.tdee} kcal  |  Target: ${macros.calories} kcal

SESSION PHILOSOPHY: ${sessionFocus}

═══════════════════════════════
WORKOUT RULES
═══════════════════════════════
- 5 sessions per week (3 strength + 1 HIIT + 1 active recovery OR 4 strength + 1 cardio — based on goal)
- Each strength session: 5–6 exercises with sets/reps/rest periods
- Include warm-up (3 exercises) and cool-down (3 stretches) for every session
- Rest periods: strength = 60–90s, HIIT = 20–40s work/rest
- All exercises appropriate for ${experience} level
- No exercises that aggravate: ${injuries}
- Include a 1-line tip per exercise (form cue or benefit)
- Progressive overload strategy specific to goal

WEEKLY SPLIT (suggestion — adapt based on goal):
- Fat loss : Full Body x3 + HIIT x1 + Active Recovery x1
- Muscle gain: Push/Pull/Legs split + Upper/Lower + Rest
- Recomp : Upper x2 + Lower x2 + Cardio x1

═══════════════════════════════
LIFESTYLE RULES REQUIRED
═══════════════════════════════
Generate specific, actionable lifestyle rules including:
1. Sleep: hours + timing + quality tips
2. Hydration: exact liters + timing around workouts + electrolyte tips
3. Daily steps target
4. 4 stress management techniques (specific, actionable — meditation, breathing, journaling, etc.)
5. Avoid list: 8 specific foods/habits to avoid for the goal
6. Recovery tips: 4 specific tips (foam rolling, contrast showers, sleep posture, etc.)
7. Supplement suggestions: evidence-based only (creatine, vitamin D, omega-3, whey if non-veg) — max 4
8. Daily habit tracker: 6 binary yes/no habits to track each day

═══════════════════════════════
RESPONSE FORMAT (strict JSON)
═══════════════════════════════
{
  "workout_plan": {
    "frequency": "5 sessions per week",
    "philosophy": "2-sentence training philosophy for this user's goal",
    "weekly_schedule_summary": ["Monday: Push", "Tuesday: Pull", "Wednesday: Rest/Active Recovery", "Thursday: Legs", "Friday: HIIT Cardio", "Saturday: Full Body", "Sunday: Rest"],
    "rest_day_activity": "30-min walk + light stretching — avoid complete inactivity",
    "progressive_overload_note": "Specific 2–3 sentence progression strategy",
    "sessions": [
      {
        "day": "Monday",
        "type": "Strength",
        "focus": "Push (Chest, Shoulders, Triceps)",
        "duration_min": 50,
        "warm_up": [
          "Arm circles: 30 seconds each direction",
          "Light band pull-aparts: 15 reps",
          "Wall push-ups: 15 reps"
        ],
        "exercises": [
          {
            "name": "Barbell Bench Press",
            "sets": 4,
            "reps": "10-12",
            "rest_sec": 75,
            "tip": "Keep shoulder blades retracted throughout the movement."
          },
          {
            "name": "Dumbbell Shoulder Press",
            "sets": 3,
            "reps": "12",
            "rest_sec": 60,
            "tip": "Press in a slight arc, not straight up, to protect shoulders."
          }
        ],
        "cool_down": [
          "Chest doorway stretch: 30 seconds each side",
          "Tricep overhead stretch: 20 seconds each arm",
          "Child's pose: 60 seconds"
        ],
        "cardio_note": null
      }
    ]
  },
  "lifestyle_rules": {
    "sleep_hours": "7–8 hours; sleep by 10:30 PM for optimal GH release",
    "water_liters": "3.5 liters; extra 500ml on workout days",
    "daily_steps": "8000–10000 steps; use stairs, walk post-meals",
    "stress_management": [
      "4-7-8 breathing: inhale 4s, hold 7s, exhale 8s — do 4 cycles before bed",
      "10-min morning journaling: write 3 gratitudes + 1 intention",
      "Digital detox 1 hour before sleep — no screens in bed",
      "Progressive muscle relaxation: tense and release each muscle group for 5 seconds"
    ],
    "avoid_list": [
      "Refined sugar (sweets, biscuits, soft drinks) — spikes insulin and promotes fat storage",
      "Deep-fried foods (samosas, pakoras) — high hidden calorie density",
      "Alcohol — disrupts sleep, inhibits fat oxidation",
      "Skipping breakfast — leads to overeating later",
      "White bread / maida products — low fiber, rapid glucose spike",
      "Eating in front of TV — mindless overeating",
      "High-sodium packaged foods (chips, instant noodles) — water retention",
      "Late-night heavy meals after 9 PM — poor digestion, fat storage"
    ],
    "recovery_tips": [
      "Foam roll quads, hamstrings, and upper back for 5 min post-workout",
      "Contrast shower: 1 min cold / 1 min warm, repeat 3 cycles after leg day",
      "Legs-up-the-wall pose for 10 min on rest days to reduce soreness",
      "Aim for 20–30g protein within 45 minutes of workout completion"
    ],
    "supplement_suggestions": [
      "Creatine monohydrate 3–5g daily (safe, evidence-backed for strength and muscle)",
      "Vitamin D3 60,000 IU once weekly (most Indians are deficient)",
      "Omega-3 (fish oil 1g or flaxseed oil 1 tbsp) daily — reduces inflammation",
      "Magnesium glycinate 300mg at bedtime — improves sleep quality"
    ],
    "habit_tracker": [
      "Hit daily calorie target (±100 kcal)?",
      "Hit daily protein target?",
      "Completed scheduled workout?",
      "Drank 3+ liters of water?",
      "Slept 7+ hours?",
      "Walked 8000+ steps?"
    ]
  }
}

Generate all 5 workout sessions with full detail. Do NOT skip warm-up, cool_down, exercises, or lifestyle rules. This is a market-ready fitness product.`;
}

// ─────────────────────────────────────────────
// FALLBACK WORKOUT PLAN (if AI fails)
// ─────────────────────────────────────────────

function getFallbackWorkout(profile: Record<string, unknown>, macros: MacroTargets): WorkoutPlan {
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

function getFallbackLifestyle(macros: MacroTargets): LifestyleRules {
  return {
    sleep_hours: "7–8 hours; aim for 10:00–10:30 PM bedtime for optimal growth hormone release",
    water_liters: `${macros.tdee > 2500 ? "3.5–4" : "3–3.5"} liters/day; extra 500ml on workout days; sip water before each meal`,
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

// ─────────────────────────────────────────────
// PARSE HELPERS
// ─────────────────────────────────────────────
function safeParseJSON(raw: string): Record<string, unknown> | null {
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      const extracted = raw.substring(start, end + 1);
      try {
        return JSON.parse(extracted);
      } catch {
        // final fallback – try cleaning the extracted part
        const cleanedExtracted = extracted
          .replace(/^```json\s*/i, "")
          .replace(/^```\s*/i, "")
          .replace(/```\s*$/i, "")
          .trim();
        try {
          return JSON.parse(cleanedExtracted);
        } catch {
          return null;
        }
      }
    }
    return null;
  }
}

// ─────────────────────────────────────────────
// MAIN HANDLER
// ─────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    // ── AUTH ─────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized — missing Bearer token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "").trim();
    const tokenHash = await hashTokenDeno(token);

    const { data: session, error: sessionError } = await supabaseAdmin
      .from("sessions")
      .select("user_id")
      .eq("token_hash", tokenHash)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (sessionError || !session) {
      return new Response(JSON.stringify({ error: "Invalid or expired session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = session.user_id;

    // ── PROFILE ──────────────────────────────
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: "Profile not found — complete onboarding first" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── REQUEST BODY ─────────────────────────
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const notes = typeof body.notes === "string" ? body.notes.slice(0, 500) : "";
    const foodType = (typeof body.food_type === "string" ? body.food_type.trim().toLowerCase() : "")
      || String(profile.food_type || "").toLowerCase()
      || "indian";
    const mealCount = clamp(safeNum(body.meal_count ?? profile.meal_count, 4), 3, 5);
    const regenerate = body.regenerate === true; // flag to force a new plan

    // ── MACRO CALCULATION (server-side, authoritative) ──
    const macros = calcMacros({ ...profile, meal_count: mealCount });

    // ── PARALLEL AI CALLS (diet + workout simultaneously) ──
    const dietPrompt = buildDietPrompt(profile, macros, foodType, mealCount, notes);
    const workoutPrompt = buildWorkoutPrompt(profile, macros);

    console.log(`[${userId}] Starting parallel AI generation — diet & workout`);

    // Fire both calls simultaneously for faster response
    const [dietResult, workoutResult] = await Promise.allSettled([
      callDeepSeek(dietPrompt, 10000, 0.25, 1),    // 10k tokens for full 7-day diet
      callDeepSeek(workoutPrompt, 3500, 0.25, 1),  // 3.5k tokens for detailed workout
    ]);

    // ── PROCESS DIET PLAN ─────────────────────
    let dietContent = dietResult.status === "fulfilled" ? dietResult.value.content : null;
    const dietTruncated = dietResult.status === "fulfilled" ? dietResult.value.truncated : false;

    // If truncated, retry with compact prompt
    if (dietTruncated || !dietContent) {
      console.warn(`[${userId}] Diet response truncated or empty — retrying compact...`);
      const compactDiet = `Create 7-day Indian ${foodType} diet plan. Daily: ${macros.calories}kcal, ${macros.protein_g}g protein, ${macros.carbs_g}g carbs, ${macros.fat_g}g fat. ${mealCount} meals/day, ₹${safeNum(profile.daily_budget, 150)}/day. ${!String(profile.dietary_pattern || "").toLowerCase().includes("non") ? "VEGETARIAN" : "NON-VEG"}. Return JSON: {"daily_macros":{"calories":${macros.calories},"protein_g":${macros.protein_g},"carbs_g":${macros.carbs_g},"fat_g":${macros.fat_g},"fiber_g":${macros.fiber_g}},"weekly_meals":[{"day":"Monday","type":"standard","total_kcal":0,"total_protein_g":0,"total_carbs_g":0,"total_fat_g":0,"hydration_reminder":"","daily_note":"","meals":[{"time":"","name":"","kcal":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":0,"prep_time_min":0,"foods":[{"name":"","quantity":"","protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":0,"kcal":0,"cost_inr":0}],"tip":""}]}]}`;
      const retryDiet = await callDeepSeek(compactDiet, 10000, 0.2);
      dietContent = retryDiet.content;
    }

    if (!dietContent) throw new Error("Failed to generate diet plan after retries");
    console.log("Raw diet response:", dietContent);
    const dietRaw = safeParseJSON(dietContent);
    if (!dietRaw) throw new Error("Diet plan AI returned unparseable JSON");

    // Unwrap if nested under "plan" key
    const planData = (dietRaw.plan ?? dietRaw) as Record<string, unknown>;
    if (!planData.weekly_meals) throw new Error("Diet plan missing weekly_meals array");

    // ALWAYS override macros with our server-calculated values (never trust AI math)
    planData.daily_macros = {
      calories: macros.calories,
      protein_g: macros.protein_g,
      carbs_g: macros.carbs_g,
      fat_g: macros.fat_g,
      fiber_g: macros.fiber_g,
    };

    const dietValidation = validateDietPlan(planData);
    if (!dietValidation.valid) {
      throw new Error(`Diet plan validation failed: ${dietValidation.reason}`);
    }

    // ── PROCESS WORKOUT PLAN ──────────────────
    let workoutPlan: WorkoutPlan;
    let lifestyleRules: LifestyleRules;

    const workoutContent = workoutResult.status === "fulfilled" ? workoutResult.value.content : null;

    if (workoutContent) {
      const workoutRaw = safeParseJSON(workoutContent);
      if (workoutRaw) {
        // Unwrap nested structure if needed
        const wp = (workoutRaw.workout_plan ?? workoutRaw.plan?.workout_plan ?? workoutRaw) as Record<string, unknown>;
        const lr = (workoutRaw.lifestyle_rules ?? workoutRaw.plan?.lifestyle_rules ?? null) as Record<string, unknown> | null;

        if (validateWorkoutPlan(wp)) {
          workoutPlan = wp as unknown as WorkoutPlan;
          console.log(`[${userId}] ✅ Workout plan parsed successfully — ${(wp.sessions as unknown[])?.length ?? 0} sessions`);
        } else {
          console.warn(`[${userId}] ⚠️ Workout plan invalid — using fallback`);
          workoutPlan = getFallbackWorkout(profile, macros);
        }

        lifestyleRules = lr
          ? (lr as unknown as LifestyleRules)
          : getFallbackLifestyle(macros);
      } else {
        console.warn(`[${userId}] ⚠️ Workout JSON unparseable — using fallback`);
        workoutPlan = getFallbackWorkout(profile, macros);
        lifestyleRules = getFallbackLifestyle(macros);
      }
    } else {
      console.warn(`[${userId}] ⚠️ Workout AI call failed — using fallback`);
      workoutPlan = getFallbackWorkout(profile, macros);
      lifestyleRules = getFallbackLifestyle(macros);
    }

    // ── ASSEMBLE FULL PLAN ────────────────────
    const fullPlan = {
      ...planData,

      // Macro calculation transparency
      macro_calculation_details: {
        bmr: macros.bmr,
        tdee: macros.tdee,
        target_calories: macros.calories,
        deficit_surplus_kcal: macros.deficit_surplus_kcal,
        weekly_weight_change_kg: macros.weekly_weight_change_kg,
        tdee_note: macros.deficit_surplus_note,
        meal_count: mealCount,
        protein_per_meal_target: Math.round(macros.protein_g / mealCount),
        calorie_per_meal_target: Math.round(macros.calories / mealCount),
        food_type: foodType,
        generated_at: new Date().toISOString(),
      },

      // Workout — always present
      workout_plan: workoutPlan,

      // Lifestyle — always present
      lifestyle_rules: lifestyleRules,
    };

    // ── SAVE TO DATABASE ──────────────────────
    // ── SAVE TO DATABASE (atomic upsert) ──
    const { count: existingCount } = await supabaseAdmin
      .from("meal_plans")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);

    const planWeek = (existingCount || 0) + 1;

    const { error: insertError } = await supabaseAdmin
      .from("meal_plans")
      .upsert(
        {
          user_id: userId,
          plan_week: planWeek,
          plan_json: fullPlan,
          food_type: foodType,
          meal_count: mealCount,
          generated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,plan_week" }
      );

    if (insertError) throw new Error("Failed to save plan to database: " + insertError.message);

    // Mark onboarding complete
    await supabaseAdmin
      .from("users")
      .update({ onboarding_completed: true, last_plan_generated_at: new Date().toISOString() })
      .eq("id", userId);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[${userId}] ✅ Plan generation complete in ${elapsed}s — Week ${planWeek}`);

    // ── RESPONSE ──────────────────────────────
    return new Response(
      JSON.stringify({
        success: true,
        plan_week: planWeek,
        generated_in_sec: parseFloat(elapsed),
        macro_summary: {
          bmr: macros.bmr,
          tdee: macros.tdee,
          calories: macros.calories,
          protein_g: macros.protein_g,
          carbs_g: macros.carbs_g,
          fat_g: macros.fat_g,
          fiber_g: macros.fiber_g,
          deficit_surplus: macros.deficit_surplus_kcal,
          weekly_change_kg: macros.weekly_weight_change_kg,
          note: macros.deficit_surplus_note,
        },
        plan: fullPlan,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (err: unknown) {
    const error = err as Error;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`Edge function error after ${elapsed}s:`, error.message);

    return new Response(
      JSON.stringify({
        error: error.message,
        elapsed: parseFloat(elapsed),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});