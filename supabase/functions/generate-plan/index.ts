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

interface MacroTargets {
  calories: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number;
  tdee: number; bmr: number; deficit_surplus_kcal: number; deficit_surplus_note: string; weekly_weight_change_kg: number;
}

interface TimingConfig { times: string[]; names: string[]; count: number; kcalSplit: number[]; }

function safeNum(val: unknown, fallback = 0): number { const n = Number(val); return isFinite(n) && n > 0 ? n : fallback; }
function sanitizeField(val: unknown): string { return val == null ? "Not specified" : String(val).replace(/[\r\n`<>]/g, " ").trim().slice(0, 200); }
function clamp(val: number, min: number, max: number): number { return Math.max(min, Math.min(max, val)); }

async function hashTokenDeno(token: string): Promise<string> {
  const enc = new TextEncoder().encode(token);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ─────────────────────────────────────────────
// MACRO MATH ENGINE
// ─────────────────────────────────────────────
function calcMacros(profile: Record<string, unknown>): MacroTargets {
  const weightKg = safeNum(profile.weight_kg, 74);
  const bodyFatPct = clamp(safeNum(profile.body_fat_percent, 17), 5, 55);
  const sex = String(profile.sex || "male").toLowerCase();
  const activityLevel = String(profile.activity_level || "moderate").toLowerCase();
  const goal = String(profile.primary_goal || "recomp").toLowerCase();

  const lbm = weightKg * (1 - bodyFatPct / 100);
  const bmr = Math.round(370 + 21.6 * lbm);

  const palMap: [string, number][] = [["sedentary", 1.2], ["light", 1.375], ["moderate", 1.55], ["heavy", 1.725]];
  let pal = 1.55;
  for (const [k, v] of palMap) { if (activityLevel.includes(k)) { pal = v; break; } }
  const tdee = Math.round(bmr * pal);

  let targetCalories: number, deficitSurplusKcal = 0, deficitSurplusNote = "";

  if (goal.includes("fat") || goal.includes("loss")) {
    targetCalories = Math.max(Math.round(tdee * 0.70), sex === "female" ? 1200 : 1500);
    deficitSurplusKcal = -(tdee - targetCalories);
    deficitSurplusNote = `Fat loss: ${Math.abs(deficitSurplusKcal)} kcal deficit.`;
  } else if (goal.includes("muscle") || goal.includes("bulk")) {
    targetCalories = Math.round(tdee * 1.10);
    deficitSurplusKcal = targetCalories - tdee;
    deficitSurplusNote = `Lean bulk: ${deficitSurplusKcal} kcal surplus.`;
  } else {
    const defPct = (bodyFatPct >= 15 && sex === "male") || (bodyFatPct >= 22 && sex === "female") ? 0.25 : 0.15;
    targetCalories = Math.max(Math.round(tdee * (1 - defPct)), sex === "female" ? 1300 : 1600);
    deficitSurplusKcal = -(tdee - targetCalories);
    deficitSurplusNote = `Recomp: ${defPct * 100}% deficit (${Math.abs(deficitSurplusKcal)} kcal).`;
  }

  const weeklyWeightChangeKg = (deficitSurplusKcal * 7) / 7700;
  const proteinG = clamp(Math.round(weightKg * 1.85), 100, 180);
  const fatG = clamp(Math.round(weightKg * 1.1), 50, 95);
  const carbsG = Math.max(Math.round((targetCalories - proteinG * 4 - fatG * 9) / 4), 60);
  const fiberG = clamp(Math.round(carbsG * 0.14), 25, 40);

  return {
    calories: proteinG * 4 + fatG * 9 + carbsG * 4,
    protein_g: proteinG, carbs_g: carbsG, fat_g: fatG, fiber_g: fiberG,
    tdee, bmr, deficit_surplus_kcal: deficitSurplusKcal, deficit_surplus_note: deficitSurplusNote,
    weekly_weight_change_kg: Math.round(weeklyWeightChangeKg * 100) / 100,
  };
}

function getMealTimingConfig(pref: string): TimingConfig {
  switch (pref) {
    case "3_meals":   return { times: ["08:00 AM", "01:30 PM", "08:00 PM"], names: ["Breakfast", "Lunch", "Dinner"], count: 3, kcalSplit: [0.30, 0.40, 0.30] };
    case "if_16_8":   return { times: ["12:00 PM", "04:00 PM", "08:00 PM"], names: ["Break-Fast", "Pre-Workout", "Dinner"], count: 3, kcalSplit: [0.35, 0.25, 0.40] };
    case "if_14_10":  return { times: ["10:00 AM", "01:30 PM", "05:00 PM", "08:00 PM"], names: ["Brunch", "Lunch", "Pre-Workout", "Dinner"], count: 4, kcalSplit: [0.25, 0.30, 0.15, 0.30] };
    case "6_meals":   return { times: ["07:30 AM", "10:30 AM", "01:30 PM", "04:30 PM", "07:30 PM", "10:00 PM"], names: ["Early Snack", "Breakfast", "Lunch", "Pre-Workout", "Dinner", "Pre-Sleep"], count: 6, kcalSplit: [0.15, 0.12, 0.25, 0.18, 0.22, 0.08] };
    default:          return { times: ["08:00 AM", "01:00 PM", "05:00 PM", "08:30 PM"], names: ["Breakfast", "Lunch", "Evening Snack", "Dinner"], count: 4, kcalSplit: [0.25, 0.30, 0.15, 0.30] };
  }
}

function ensureArray(val: any): any[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  return [val];
}

// ─────────────────────────────────────────────
// DIET VALIDATOR & AUTO-SCALER
// ─────────────────────────────────────────────
function validateAndScaleMacros(plan: any, macros: MacroTargets): any {
  const weeklyMeals = ensureArray(plan.weekly_meals);
  if (weeklyMeals.length === 0) return plan;

  const targetP = macros.protein_g;
  const targetC = macros.carbs_g;
  const targetF = macros.fat_g;

  const fixed = weeklyMeals.map((day: any) => {
    const meals = ensureArray(day.meals);
    const parsedMeals = meals.map((meal: any) => {
      const foodsRaw = ensureArray(meal.foods || meal.ingredients || meal.items);
      const normalizedFoods = foodsRaw.map((food: any) => {
        const p = Math.round(safeNum(food.protein_g ?? food.protein ?? food.Protein));
        const c = Math.round(safeNum(food.carbs_g ?? food.carbs ?? food.Carbs));
        const f = Math.round(safeNum(food.fat_g ?? food.fat ?? food.Fat));
        const fib = Math.round(safeNum(food.fiber_g ?? food.fiber ?? food.Fiber));
        return { name: String(food.name || "Food"), quantity: String(food.quantity || "1 serving"), protein_g: p, carbs_g: c, fat_g: f, fiber_g: fib, kcal: (p * 4) + (c * 4) + (f * 9) };
      });
      return { ...meal, foods: normalizedFoods };
    });

    let currP = 0, currC = 0, currF = 0;
    parsedMeals.forEach((m: any) => m.foods.forEach((f: any) => { currP += f.protein_g; currC += f.carbs_g; currF += f.fat_g; }));
    if (currP === 0) currP = 1;
    if (currC === 0) currC = 1;
    if (currF === 0) currF = 1;

    const ratioP = targetP / currP;
    const ratioC = targetC / currC;
    const ratioF = targetF / currF;
    let newDayP = 0, newDayC = 0, newDayF = 0;

    const scaledMeals = parsedMeals.map((meal: any) => {
      let mealP = 0, mealC = 0, mealF = 0, mealFib = 0;
      const scaledFoods = meal.foods.map((food: any) => {
        const p = Math.round(food.protein_g * ratioP);
        const c = Math.round(food.carbs_g * ratioC);
        const f = Math.round(food.fat_g * ratioF);
        const fib = Math.round(food.fiber_g * ratioC);
        let qty = food.quantity;
        const avgRatio = (ratioP + ratioC + ratioF) / 3;
        if (Math.abs(avgRatio - 1) > 0.10) {
          qty = qty.replace(/\b\d+(\.\d+)?\b/g, (match: string) => Math.round(parseFloat(match) * avgRatio).toString());
        }
        mealP += p; mealC += c; mealF += f; mealFib += fib;
        return { ...food, quantity: qty, protein_g: p, carbs_g: c, fat_g: f, fiber_g: fib, kcal: (p * 4) + (c * 4) + (f * 9) };
      });
      newDayP += mealP; newDayC += mealC; newDayF += mealF;
      return { ...meal, foods: scaledFoods, protein_g: mealP, carbs_g: mealC, fat_g: mealF, fiber_g: mealFib, kcal: (mealP * 4) + (mealC * 4) + (mealF * 9) };
    });

    const diffP = targetP - newDayP;
    const diffC = targetC - newDayC;
    const diffF = targetF - newDayF;
    if ((diffP !== 0 || diffC !== 0 || diffF !== 0) && scaledMeals.length > 0) {
      const lastMeal = scaledMeals[scaledMeals.length - 1];
      if (lastMeal.foods.length > 0) {
        const lastFood = lastMeal.foods[lastMeal.foods.length - 1];
        lastFood.protein_g = Math.max(0, lastFood.protein_g + diffP);
        lastFood.carbs_g = Math.max(0, lastFood.carbs_g + diffC);
        lastFood.fat_g = Math.max(0, lastFood.fat_g + diffF);
        lastFood.kcal = (lastFood.protein_g * 4) + (lastFood.carbs_g * 4) + (lastFood.fat_g * 9);
        lastMeal.protein_g += diffP; lastMeal.carbs_g += diffC; lastMeal.fat_g += diffF;
        lastMeal.kcal = (lastMeal.protein_g * 4) + (lastMeal.carbs_g * 4) + (lastMeal.fat_g * 9);
        newDayP += diffP; newDayC += diffC; newDayF += diffF;
      }
    }

    return {
      ...day,
      meals: scaledMeals,
      total_kcal: (newDayP * 4) + (newDayC * 4) + (newDayF * 9),
      total_protein_g: newDayP,
      total_carbs_g: newDayC,
      total_fat_g: newDayF,
    };
  });

  return { ...plan, weekly_meals: fixed };
}

function safeParseJSON(raw: string): any {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch {
    try {
      const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
      if (s !== -1 && e > s) return JSON.parse(raw.substring(s, e + 1));
    } catch {}
  }
  return null;
}

function expandToSevenDays(plan: any, macros: MacroTargets): any {
  const base = ensureArray(plan.weekly_meals);
  if (base.length === 0) return plan;
  if (base.length >= 7) return plan;

  const d1 = base[0];
  const d2 = base[1 % base.length];
  const d4 = base[3 % base.length];

  const extras = [
    { ...d4, day: "Friday",   day_name: "Friday",   type: "standard", daily_note: "HIIT day — maintain intensity.",                              hydration_reminder: "500ml water pre-workout." },
    { ...d2, day: "Saturday", day_name: "Saturday",  type: "refeed",   total_kcal: macros.calories + 200, daily_note: `Refeed day — ${macros.calories + 200} kcal to prevent metabolic adaptation.`, hydration_reminder: "Extra carbs require extra water." },
    { ...d1, day: "Sunday",   day_name: "Sunday",    type: "rest",     daily_note: "Rest day — muscles grow outside the gym.",                   hydration_reminder: "Hydrate and prep meals for tomorrow." },
  ];

  return { ...plan, weekly_meals: [...base, ...extras] };
}

// ─────────────────────────────────────────────
// FALLBACK DIET PLAN (fires when both AI diet calls fail)
// ─────────────────────────────────────────────
function getFallbackDietPlan(
  macros: MacroTargets,
  timing: TimingConfig,
  profile: Record<string, unknown>
): any {
  const dp = String(profile.dietary_pattern || "eggetarian").toLowerCase();
  const isVegan = dp === "vegan";
  const isVeg = dp === "vegetarian";

  // Pick the primary protein source for this diet type
  const primaryProtein = isVegan
    ? { name: "Tofu (firm)", quantity: "150g", protein_g: 12, carbs_g: 2, fat_g: 8, fiber_g: 1, kcal: 126 }
    : isVeg
    ? { name: "Paneer", quantity: "100g", protein_g: 18, carbs_g: 3, fat_g: 14, fiber_g: 0, kcal: 210 }
    : { name: "Boiled eggs", quantity: "3 eggs", protein_g: 18, carbs_g: 1, fat_g: 10, fiber_g: 0, kcal: 166 };

  const secondaryProtein = isVegan
    ? { name: "Masoor dal (cooked)", quantity: "150g", protein_g: 9, carbs_g: 20, fat_g: 0, fiber_g: 8, kcal: 116 }
    : { name: "Curd (low-fat)", quantity: "150g", protein_g: 8, carbs_g: 6, fat_g: 2, fiber_g: 0, kcal: 74 };

  const buildMeal = (mealName: string, time: string, frac: number) => {
    const kcal  = Math.round(macros.calories   * frac);
    const p     = Math.round(macros.protein_g  * frac);
    const c     = Math.round(macros.carbs_g    * frac);
    const f     = Math.round(macros.fat_g      * frac);

    return {
      time,
      name: mealName,
      kcal, protein_g: p, carbs_g: c, fat_g: f, fiber_g: 5,
      prep_time_min: 10,
      foods: [
        primaryProtein,
        { name: "Oats / brown rice (dry)", quantity: "60g", protein_g: 5, carbs_g: 40, fat_g: 2, fiber_g: 4, kcal: 200 },
        { name: "Mixed sabzi (stir-fried)", quantity: "100g", protein_g: 2, carbs_g: 8, fat_g: 1, fiber_g: 3, kcal: 49 },
        secondaryProtein,
      ],
      tip: "Weigh dry grains. Swap sabzi daily to avoid monotony (broccoli, beans, capsicum, carrot).",
    };
  };

  const buildDay = (day: string, type: string, note: string) => ({
    day, day_name: day, type,
    total_kcal: macros.calories,
    total_protein_g: macros.protein_g,
    total_carbs_g: macros.carbs_g,
    total_fat_g: macros.fat_g,
    hydration_reminder: "3.5L water today. 500ml on waking.",
    daily_note: note,
    meals: timing.names.map((name, i) => buildMeal(name, timing.times[i], timing.kcalSplit[i])),
  });

  return {
    weekly_rules: {
      protein_strategy: `${macros.protein_g}g protein spread across ${timing.count} meals. Prioritise whole-food sources — whey post-workout only if whole foods fall short.`,
      refeed_day: "Saturday — add ~200 kcal from complex carbs (sweet potato, banana, oats). Keep fat the same.",
      steps_target: "8,000–10,000 steps daily. Walk 10 mins after every main meal.",
      sleep_protocol: "7.5–8 hours. Sleep and wake at the same time daily — cortisol control matters for recomp.",
      water_target: "3.5 litres. Spread through the day; do not chug.",
    },
    weekly_meals: [
      buildDay("Monday",    "standard", "Training day — hit protein target. Pre-workout meal 90 mins before session."),
      buildDay("Tuesday",   "standard", "Training day — focus on micronutrients. Add a seasonal fruit post-workout."),
      buildDay("Wednesday", "standard", "Rest or light cardio. Keep calories the same; reduce carbs by ~20g if fully sedentary."),
      buildDay("Thursday",  "standard", "Training day — heaviest lifts this week. Fuel accordingly."),
    ],
  };
}

// ─────────────────────────────────────────────
// FALLBACK WORKOUT (fires if AI returns empty/invalid)
// ─────────────────────────────────────────────
function getFallbackWorkout() {
  return {
    workout_plan: {
      frequency: "5 sessions per week",
      philosophy: "Push-Pull-Legs maximizes stimulus. Compound lifts drive the hormonal environment for recomposition. HIIT offsets any weekend caloric surplus.",
      weekly_schedule_summary: ["Mon: Push (Chest, Shoulders, Triceps)", "Tue: Pull (Back, Biceps)", "Wed: Rest / Walk", "Thu: Legs (Quads, Hamstrings, Glutes)", "Fri: HIIT + Core", "Sat: Full Body Strength", "Sun: Rest / Mobility"],
      rest_day_activity: "8,000-step brisk walk. Keeps NEAT high without causing muscle damage.",
      progressive_overload_note: "Add 2.5kg to compound lifts every 1-2 weeks. Track your reps closely.",
      sessions: [
        {
          day: "Monday", type: "Strength", focus: "Push", duration_min: 50,
          warm_up: ["Arm circles × 20", "Band pull-aparts × 15"],
          exercises: [
            { name: "Dumbbell Bench Press",  sets: 4, reps: "8-10",  rest_sec: 90, tip: "Retract scapula before pressing." },
            { name: "Overhead Press",         sets: 3, reps: "10-12", rest_sec: 75, tip: "Tuck ribs — don't flare." },
            { name: "Incline Dumbbell Fly",   sets: 3, reps: "12-15", rest_sec: 60, tip: "Slight elbow bend throughout." },
            { name: "Tricep Pushdown",        sets: 3, reps: "12-15", rest_sec: 60, tip: "Fully extend elbow at bottom." },
          ],
          cool_down: ["Chest stretch 30s"],
        },
        {
          day: "Tuesday", type: "Strength", focus: "Pull", duration_min: 50,
          warm_up: ["Dead hangs 30s", "Cat-camel × 10"],
          exercises: [
            { name: "Lat Pulldown / Pull-Ups", sets: 4, reps: "8-10",  rest_sec: 90, tip: "Depress shoulder blades first." },
            { name: "Dumbbell Rows",            sets: 3, reps: "10-12", rest_sec: 75, tip: "Drive elbow past torso." },
            { name: "Face Pulls",               sets: 3, reps: "15-20", rest_sec: 45, tip: "Pull to nose level." },
            { name: "Bicep Curls",              sets: 3, reps: "10-12", rest_sec: 60, tip: "Supinate wrist at top." },
          ],
          cool_down: ["Lat stretch 30s"],
        },
        {
          day: "Thursday", type: "Strength", focus: "Legs", duration_min: 55,
          warm_up: ["Bodyweight squats × 20", "Glute bridges × 15"],
          exercises: [
            { name: "Goblet Squat / Back Squat", sets: 4, reps: "8-10",        rest_sec: 120, tip: "Knees track over toes." },
            { name: "Romanian Deadlift",          sets: 3, reps: "10-12",       rest_sec: 90,  tip: "Push hips back, not down." },
            { name: "Walking Lunges",             sets: 3, reps: "12 each leg", rest_sec: 60,  tip: "Upright torso reduces knee stress." },
            { name: "Calf Raises",                sets: 4, reps: "15-20",       rest_sec: 45,  tip: "Full stretch at bottom." },
          ],
          cool_down: ["Quad stretch 30s"],
        },
        {
          day: "Friday", type: "Cardio", focus: "HIIT + Core", duration_min: 35,
          warm_up: ["Jumping jacks 1 min"],
          exercises: [
            { name: "Burpees",          sets: 5, reps: "30s work / 20s rest", rest_sec: 20, tip: "Land softly." },
            { name: "Mountain Climbers", sets: 4, reps: "40 total",            rest_sec: 20, tip: "Hips level — don't pike." },
            { name: "Plank Hold",       sets: 3, reps: "60 seconds",           rest_sec: 30, tip: "Squeeze glutes and abs." },
          ],
          cool_down: ["Child's pose 60s"],
        },
        {
          day: "Saturday", type: "Strength", focus: "Full Body", duration_min: 45,
          warm_up: ["Dynamic flow 3 mins"],
          exercises: [
            { name: "Dumbbell Thrusters",    sets: 4, reps: "10-12",       rest_sec: 90, tip: "Fluid movement from squat to press." },
            { name: "Kettlebell Swings",      sets: 3, reps: "15-20",       rest_sec: 60, tip: "Hip hinge, power from glutes." },
            { name: "Push-Up to Rotation",   sets: 3, reps: "8 each side", rest_sec: 60, tip: "Builds rotational core stability." },
          ],
          cool_down: ["Full body stretch 5 mins"],
        },
      ],
    },
    lifestyle_rules: {
      sleep_hours: "7.5–8 hours. Under 7 hours raises cortisol and severely limits muscle recovery.",
      water_liters: "3.5 liters/day. 500ml on waking, 300ml before meals.",
      daily_steps: "8,000–10,000 steps daily. Walk after meals to blunt the glucose spike.",
      stress_management: ["4-7-8 breathing before bed to activate parasympathetic system.", "10 mins phone-free after waking."],
      avoid_list: ["Liquid calories (juice, sweetened chai)", "Deep-fried snacks", "Alcohol — fragments sleep and drops testosterone overnight"],
      recovery_tips: ["Foam roll major muscle groups post-session.", "Consume 30g+ protein within 45 mins post-workout."],
      supplement_suggestions: ["Whey Protein: 1 scoop post-workout.", "Vitamin D3: 2,000 IU daily with a fat-containing meal."],
      habit_tracker: ["Hit calorie target?", "Hit protein target?", "Worked out?", "Drank 3.5L water?"],
    },
  };
}

// ─────────────────────────────────────────────
// DEEPSEEK CALLER — 25s timeout (safe under Supabase edge limits)
// ─────────────────────────────────────────────
async function callDeepSeek(prompt: string, maxTokens: number): Promise<{ content: string | null }> {
  const key = Deno.env.get("DEEPSEEK_API_KEY");
  if (!key) return { content: null };

  const ctrl = new AbortController();
  // FIX: was 115_000 — Supabase edge functions are killed at ~25-60s wall clock,
  // so the old value never fired and the platform killed the request instead.
  const timer = setTimeout(() => ctrl.abort(), 25_000);

  try {
    const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: "You are an elite Indian Sports Nutritionist. Respond ONLY with valid JSON." },
          { role: "user", content: prompt },
        ],
        temperature: 0.30,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return { content: null };
    const data = await res.json();
    return { content: data.choices?.[0]?.message?.content || null };
  } catch {
    clearTimeout(timer);
    return { content: null };
  }
}

// ─────────────────────────────────────────────
// PROMPT BUILDERS
// ─────────────────────────────────────────────
function buildDietPrompt(
  profile: Record<string, unknown>,
  macros: MacroTargets,
  timing: TimingConfig,
  foodType: string,
  notes: string,
  days: string[]          // FIX: now accepts a days array so we can split into 2×2-day calls
): string {
  const dp = String(profile.dietary_pattern || "vegetarian").toLowerCase();
  let dietRule = "";
  if (dp === "vegetarian") dietRule = "STRICTLY VEGETARIAN. FATAL ERROR IF YOU USE EGGS, MEAT, OR CHICKEN. Use ONLY Paneer, Soya, Dal, Curd, Whey.";
  else if (dp === "vegan")  dietRule = "STRICTLY VEGAN. NO DAIRY, NO EGGS. Use Tofu, Soya, Dal.";
  else if (dp === "eggetarian") dietRule = "EGGETARIAN. Eggs allowed. NO MEAT/CHICKEN. Use Eggs, Paneer, Soya, Dal, Curd.";
  else                          dietRule = "NON-VEG allowed. Use Chicken, Fish, Eggs, Paneer, Soya.";

  const mealTargets = timing.kcalSplit.map((frac, i) => {
    const p = Math.round(macros.protein_g * frac);
    const c = Math.round(macros.carbs_g   * frac);
    const f = Math.round(macros.fat_g     * frac);
    const k = Math.round(macros.calories  * frac);
    return `Meal ${i + 1} (${timing.names[i]}): ${k} kcal | ${p}g Protein | ${c}g Carbs | ${f}g Fat`;
  }).join("\n");

  return `Generate a ${days.length}-day Indian diet plan (${days.join(", ")}).
TARGETS: ${macros.calories}kcal, ${macros.protein_g}g Protein, ${macros.carbs_g}g Carbs, ${macros.fat_g}g Fat. Goal: ${sanitizeField(profile.primary_goal)}. Food style: ${foodType}.
${notes ? `CRITICAL USER FEEDBACK/NOTES: ${notes}` : ""}

CRITICAL RULES:
1. DIET: ${dietRule}
2. SCHEDULE: Exactly ${timing.count} meals per day.
   STRICT PER-MEAL TARGETS:
   ${mealTargets}
3. "protein_g", "carbs_g", "fat_g", "kcal" MUST be pure integers (e.g., 15), NOT strings.
4. "quantity" MUST be exact grams (e.g. "100g", "60g dry"). Never "bowl".
5. Only generate days: ${days.join(", ")}. Do NOT add extra days.

OUTPUT JSON SCHEMA:
{
  "weekly_rules": { "protein_strategy": "...", "refeed_day": "...", "steps_target": "...", "sleep_protocol": "...", "water_target": "..." },
  "weekly_meals": [
    {
      "day": "${days[0]}", "day_name": "${days[0]}", "type": "standard",
      "total_kcal": ${macros.calories}, "total_protein_g": ${macros.protein_g}, "total_carbs_g": ${macros.carbs_g}, "total_fat_g": ${macros.fat_g},
      "hydration_reminder": "...", "daily_note": "...",
      "meals": [
        {
          "time": "${timing.times[0]}", "name": "${timing.names[0]}",
          "kcal": 500, "protein_g": 35, "carbs_g": 40, "fat_g": 12, "fiber_g": 5, "prep_time_min": 10,
          "foods": [{ "name": "Paneer", "quantity": "100g", "protein_g": 18, "carbs_g": 3, "fat_g": 14, "fiber_g": 0, "kcal": 210 }],
          "tip": "..."
        }
      ]
    }
  ]
}`;
}

function buildWorkoutPrompt(): string {
  return `Generate a 5-day/week workout plan + lifestyle rules. Return JSON ONLY with keys "workout_plan" and "lifestyle_rules".`;
}

// ─────────────────────────────────────────────
// MAIN HANDLER
// ─────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Error("Unauthorized");
    const tokenHash = await hashTokenDeno(authHeader.replace("Bearer ", "").trim());
    const { data: session } = await supabaseAdmin
      .from("sessions")
      .select("user_id")
      .eq("token_hash", tokenHash)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (!session) throw new Error("Invalid session");

    const userId = session.user_id;
    const { data: profile } = await supabaseAdmin.from("profiles").select("*").eq("user_id", userId).single();
    if (!profile) throw new Error("Profile not found");

    const timingPref = String(profile.meal_timing || "4_meals").toLowerCase();
    const timing     = getMealTimingConfig(timingPref);
    const macros     = calcMacros(profile);
    const foodType   = String(body.food_type || profile.food_type || "indian");
    const notes      = String(body.notes || "").slice(0, 500);

    // FIX: Split 6000-token diet call into two 3000-token calls (Mon-Tue + Wed-Thu).
    // Run all three in parallel — each stays well under the 25s abort and platform limits.
    const [diet1Result, diet2Result, workoutResult] = await Promise.allSettled([
      callDeepSeek(buildDietPrompt(profile, macros, timing, foodType, notes, ["Monday", "Tuesday"]),     3000),
      callDeepSeek(buildDietPrompt(profile, macros, timing, foodType, notes, ["Wednesday", "Thursday"]), 3000),
      callDeepSeek(buildWorkoutPrompt(), 3000),
    ]);

    // Merge diet chunks — fall back to static plan if both fail
    const d1 = diet1Result.status === "fulfilled" ? safeParseJSON(diet1Result.value.content ?? "") : null;
    const d2 = diet2Result.status === "fulfilled" ? safeParseJSON(diet2Result.value.content ?? "") : null;

    let dietRaw: any;

    if (d1?.weekly_meals && d2?.weekly_meals) {
      // Both succeeded — merge weekly_meals arrays, take weekly_rules from d1
      dietRaw = {
        ...d1,
        weekly_meals: [...ensureArray(d1.weekly_meals), ...ensureArray(d2.weekly_meals)],
      };
    } else if (d1?.weekly_meals) {
      // Only first chunk succeeded — expandToSevenDays will pad the rest
      console.warn(`[${userId}] Diet chunk 2 failed. Continuing with chunk 1 only.`);
      dietRaw = d1;
    } else if (d2?.weekly_meals) {
      // Only second chunk succeeded
      console.warn(`[${userId}] Diet chunk 1 failed. Continuing with chunk 2 only.`);
      dietRaw = d2;
    } else {
      // FIX: Both AI calls failed — inject static fallback instead of throwing.
      // Original code threw here, discarding the already-completed workout result.
      console.warn(`[${userId}] Both diet chunks failed. Using static fallback diet.`);
      dietRaw = getFallbackDietPlan(macros, timing, profile);
    }

    // Expand to 7 days and auto-scale macros
    dietRaw = expandToSevenDays(dietRaw, macros);
    dietRaw = validateAndScaleMacros(dietRaw, macros);

    // Workout validation — fall back to detailed static plan if AI returned empty/invalid
    let workoutData = workoutResult.status === "fulfilled" && workoutResult.value.content
      ? safeParseJSON(workoutResult.value.content)
      : null;

    const hasValidSessions = Array.isArray(workoutData?.workout_plan?.sessions) && workoutData.workout_plan.sessions.length >= 3;
    const hasValidRules    = Array.isArray(workoutData?.lifestyle_rules?.avoid_list) && workoutData.lifestyle_rules.avoid_list.length > 0;

    if (!workoutData || !workoutData.workout_plan || !hasValidSessions || !hasValidRules) {
      console.warn(`[${userId}] Workout AI empty/invalid. Injecting detailed fallback.`);
      workoutData = getFallbackWorkout();
    }

    const fullPlan = {
      ...dietRaw,
      workout_plan:    workoutData.workout_plan,
      lifestyle_rules: workoutData.lifestyle_rules || dietRaw.weekly_rules,
      daily_macros:    macros,
    };

    // Upsert plan to DB
    const { count } = await supabaseAdmin
      .from("meal_plans")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);

    await supabaseAdmin.from("meal_plans").upsert(
      {
        user_id:       userId,
        plan_week:     (count || 0) + 1,
        plan_json:     fullPlan,
        food_type:     foodType,
        meal_count:    timing.count,
        generated_at:  new Date().toISOString(),
      },
      { onConflict: "user_id,plan_week" }
    );

    await supabaseAdmin.from("users").update({ onboarding_completed: true }).eq("id", userId);

    return new Response(
      JSON.stringify({ success: true, plan: fullPlan }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});