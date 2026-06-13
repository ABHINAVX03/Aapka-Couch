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
// MACRO MATH ENGINE (Strict Recomp 25% Deficit)
// ─────────────────────────────────────────────
function calcMacros(profile: Record<string, unknown>): MacroTargets {
  const weightKg = safeNum(profile.weight_kg, 74);
  const heightCm = safeNum(profile.height_cm, 178);
  const sex = String(profile.sex || "male").toLowerCase();
  const bodyFatPct = clamp(safeNum(profile.body_fat_percent, 17), 5, 55);
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

  let proteinG = clamp(Math.round(weightKg * 1.85), 100, 180);
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
    case "3_meals": return { times: ["08:00 AM", "01:30 PM", "08:00 PM"], names: ["Breakfast", "Lunch", "Dinner"], count: 3, kcalSplit: [0.30, 0.40, 0.30] };
    case "if_16_8": return { times: ["12:00 PM", "04:00 PM", "08:00 PM"], names: ["Break-Fast", "Pre-Workout", "Dinner"], count: 3, kcalSplit: [0.35, 0.25, 0.40] };
    case "if_14_10": return { times: ["10:00 AM", "01:30 PM", "05:00 PM", "08:00 PM"], names: ["Brunch", "Lunch", "Pre-Workout", "Dinner"], count: 4, kcalSplit: [0.25, 0.30, 0.15, 0.30] };
    case "6_meals": return { times: ["07:30 AM", "10:30 AM", "01:30 PM", "04:30 PM", "07:30 PM", "10:00 PM"], names: ["Early Breakfast", "Mid-Morning", "Lunch", "Pre-Workout", "Dinner", "Pre-Sleep"], count: 6, kcalSplit: [0.15, 0.12, 0.25, 0.18, 0.22, 0.08] };
    default: return { times: ["08:00 AM", "01:00 PM", "05:00 PM", "08:30 PM"], names: ["Breakfast", "Lunch", "Evening Snack", "Dinner"], count: 4, kcalSplit: [0.25, 0.30, 0.15, 0.30] };
  }
}

function ensureArray(val: any): any[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  return [val];
}

// ─────────────────────────────────────────────
// THE AUTO-SCALER (Fixes AI Math Hallucinations)
// ─────────────────────────────────────────────
function validateAndScaleMacros(plan: any, macros: MacroTargets): any {
  const weeklyMeals = ensureArray(plan.weekly_meals);
  if (weeklyMeals.length === 0) return plan;

  const targetP = macros.protein_g;
  const targetC = macros.carbs_g;
  const targetF = macros.fat_g;

  const fixed = weeklyMeals.map((day: any) => {
    const meals = ensureArray(day.meals);

    // 1. Read AI data
    const parsedMeals = meals.map((meal: any) => {
      const foodsRaw = ensureArray(meal.foods || meal.ingredients || meal.items);
      const normalizedFoods = foodsRaw.map((food: any) => {
        const p = Math.round(safeNum(food.protein_g ?? food.protein ?? food.Protein));
        const c = Math.round(safeNum(food.carbs_g ?? food.carbs ?? food.Carbs));
        const f = Math.round(safeNum(food.fat_g ?? food.fat ?? food.Fat));
        const fib = Math.round(safeNum(food.fiber_g ?? food.fiber ?? food.Fiber));
        return {
          name: String(food.name || "Food"),
          quantity: String(food.quantity || "1 serving"),
          protein_g: p, carbs_g: c, fat_g: f, fiber_g: fib,
          kcal: (p * 4) + (c * 4) + (f * 9)
        };
      });
      return { ...meal, foods: normalizedFoods };
    });

    // 2. Sum up what the AI generated
    let currP = 0, currC = 0, currF = 0;
    parsedMeals.forEach((m: any) => m.foods.forEach((f: any) => {
      currP += f.protein_g; currC += f.carbs_g; currF += f.fat_g;
    }));

    if (currP === 0) currP = 1;
    if (currC === 0) currC = 1;
    if (currF === 0) currF = 1;

    // 3. Calculate adjustment ratios
    const ratioP = targetP / currP;
    const ratioC = targetC / currC;
    const ratioF = targetF / currF;

    let newDayP = 0, newDayC = 0, newDayF = 0;

    // 4. Scale all foods up or down to hit 100% exactly
    const scaledMeals = parsedMeals.map((meal: any) => {
      let mealP = 0, mealC = 0, mealF = 0, mealFib = 0;

      const scaledFoods = meal.foods.map((food: any) => {
        let p = Math.round(food.protein_g * ratioP);
        let c = Math.round(food.carbs_g * ratioC);
        let f = Math.round(food.fat_g * ratioF);
        let fib = Math.round(food.fiber_g * ratioC);
        let k = (p * 4) + (c * 4) + (f * 9);

        // Scale the text quantity (e.g., "100g" -> "120g") if the ratio change is noticeable
        let qty = food.quantity;
        const avgRatio = (ratioP + ratioC + ratioF) / 3;
        if (Math.abs(avgRatio - 1) > 0.10) {
          qty = qty.replace(/\b\d+(\.\d+)?\b/g, (match: string) => {
            const num = parseFloat(match);
            return Math.round(num * avgRatio).toString();
          });
        }

        mealP += p; mealC += c; mealF += f; mealFib += fib;
        return { ...food, quantity: qty, protein_g: p, carbs_g: c, fat_g: f, fiber_g: fib, kcal: k };
      });

      newDayP += mealP; newDayC += mealC; newDayF += mealF;
      const mealKcal = (mealP * 4) + (mealC * 4) + (mealF * 9);

      return { ...meal, foods: scaledFoods, protein_g: mealP, carbs_g: mealC, fat_g: mealF, fiber_g: mealFib, kcal: mealKcal };
    });

    // 5. Dump any rounding remainders perfectly into the very last food item of the day
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

        lastMeal.protein_g += diffP;
        lastMeal.carbs_g += diffC;
        lastMeal.fat_g += diffF;
        lastMeal.kcal = (lastMeal.protein_g * 4) + (lastMeal.carbs_g * 4) + (lastMeal.fat_g * 9);

        newDayP += diffP; newDayC += diffC; newDayF += diffF;
      }
    }

    const newDayKcal = (newDayP * 4) + (newDayC * 4) + (newDayF * 9);
    return { ...day, meals: scaledMeals, total_kcal: newDayKcal, total_protein_g: newDayP, total_carbs_g: newDayC, total_fat_g: newDayF };
  });

  return { ...plan, weekly_meals: fixed };
}

function safeParseJSON(raw: string): any {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch {
    try { const s = raw.indexOf("{"), e = raw.lastIndexOf("}"); if (s !== -1 && e > s) return JSON.parse(raw.substring(s, e + 1)); } catch {}
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
    { ...d4, day: "Friday", day_name: "Friday", type: "standard", daily_note: "HIIT day — maintain intensity.", hydration_reminder: "500ml water pre-workout." },
    { ...d2, day: "Saturday", day_name: "Saturday", type: "refeed", total_kcal: macros.calories + 200, daily_note: `Refeed day — ${macros.calories + 200} kcal to prevent metabolic adaptation.`, hydration_reminder: "Extra carbs require extra water." },
    { ...d1, day: "Sunday", day_name: "Sunday", type: "rest", daily_note: "Rest day — muscles grow outside the gym.", hydration_reminder: "Hydrate and prep meals for tomorrow." }
  ];

  return { ...plan, weekly_meals: [...base, ...extras] };
}

function getFallbackDiet(macros: MacroTargets, profile: Record<string, unknown>, timing: TimingConfig): any {
  const dp = String(profile.dietary_pattern || "vegetarian").toLowerCase();
  const proBases = [];
  
  if (dp === "vegan") {
    proBases.push({ n: "Soya Chunks (boiled)", q: 50, u: "g dry", p: 26, c: 17, f: 0.5, fib: 7 });
    proBases.push({ n: "Tofu (cubed)", q: 100, u: "g", p: 16, c: 3, f: 8, fib: 1 });
  } else if (dp === "vegetarian") {
    proBases.push({ n: "Paneer (cubed)", q: 100, u: "g", p: 18, c: 3, f: 14, fib: 0 });
    proBases.push({ n: "Soya Chunks (boiled)", q: 50, u: "g dry", p: 26, c: 17, f: 0.5, fib: 7 });
  } else if (dp === "eggetarian") {
    proBases.push({ n: "Whole Eggs", q: 1, u: " large", p: 6, c: 0.5, f: 5, fib: 0 });
    proBases.push({ n: "Egg Whites", q: 4, u: " whites", p: 14, c: 0, f: 0, fib: 0 });
  } else {
    proBases.push({ n: "Chicken Breast", q: 100, u: "g raw", p: 23, c: 0, f: 1.5, fib: 0 });
    proBases.push({ n: "Whole Eggs", q: 1, u: " large", p: 6, c: 0.5, f: 5, fib: 0 });
  }

  const carbBases = [
    { n: "White Rice (cooked)", q: 100, u: "g", p: 2.5, c: 28, f: 0.3, fib: 0.5 },
    { n: "Whole Wheat Roti", q: 1, u: " roti", p: 3, c: 15, f: 0.5, fib: 2 }
  ];

  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  
  const weekly_meals = days.map((day, dIdx) => {
    const meals = timing.times.map((time, mIdx) => {
      let targetP = Math.round(macros.protein_g * timing.kcalSplit[mIdx]);
      let targetC = Math.round(macros.carbs_g * timing.kcalSplit[mIdx]);
      let targetF = Math.round(macros.fat_g * timing.kcalSplit[mIdx]);

      const pb = proBases[(dIdx + mIdx) % proBases.length];
      const foods = [];
      foods.push({ name: pb.n, quantity: `1 serving`, protein_g: targetP, carbs_g: 5, fat_g: targetF, fiber_g: 2, kcal: targetP * 4 + 5 * 4 + targetF * 9 });

      const cb = carbBases[(dIdx + mIdx) % carbBases.length];
      foods.push({ name: cb.n, quantity: `1 serving`, protein_g: 0, carbs_g: targetC - 5, fat_g: 0, fiber_g: 3, kcal: (targetC - 5) * 4 });

      return { time, name: timing.names[mIdx], kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, foods, tip: "Eat protein first — activates fullness signals faster." };
    });
    return { day, day_name: day, type: "standard", total_kcal: 0, total_protein_g: 0, total_carbs_g: 0, total_fat_g: 0, hydration_reminder: "Drink a glass of water before each meal.", daily_note: "Hit your macro targets perfectly today.", meals };
  });

  return { weekly_rules: { protein_strategy: "Prioritize hitting your protein target across your meals.", refeed_day: `Sunday: Eat at ${macros.calories + 300} kcal.`, steps_target: "9,000–10,000 steps daily.", sleep_protocol: "7.5–8 hrs nightly.", water_target: "3.5–4 L daily." }, weekly_meals };
}

function getFallbackWorkout() {
  return {
    workout_plan: { frequency: "5 sessions per week", philosophy: "Progressive overload on compound movements.", weekly_schedule_summary: ["Mon: Push", "Tue: Pull", "Wed: Rest", "Thu: Legs", "Fri: HIIT", "Sat: Full Body", "Sun: Rest"], rest_day_activity: "8,000-step walk.", progressive_overload_note: "Add 2.5kg to compound lifts every 1-2 weeks.", sessions: [{ day: "Monday", type: "Strength", focus: "Push", duration_min: 45, warm_up: ["Arm circles"], exercises: [{ name: "Pushups", sets: 4, reps: "10-12", rest_sec: 90, tip: "Retract scapula." }], cool_down: ["Chest stretch"] }] },
    lifestyle_rules: { sleep_hours: "7.5–8 hours", water_liters: "3.5 liters/day", daily_steps: "8,000–10,000 steps", stress_management: ["4-7-8 breathing"], avoid_list: ["Liquid calories"], recovery_tips: ["Foam roll"], supplement_suggestions: ["Vitamin D3"], habit_tracker: ["Hit protein?"] }
  };
}

async function callDeepSeek(prompt: string, maxTokens: number): Promise<{ content: string | null }> {
  const key = Deno.env.get("DEEPSEEK_API_KEY");
  if (!key) return { content: null };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 115_000);

  try {
    const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [{ role: "system", content: "You are an elite Indian Sports Nutritionist. Respond ONLY with valid JSON." }, { role: "user", content: prompt }],
        temperature: 0.30, max_tokens: maxTokens, response_format: { type: "json_object" },
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return { content: null };
    const data = await res.json();
    return { content: data.choices?.[0]?.message?.content || null };
  } catch { clearTimeout(timer); return { content: null }; }
}

function buildDietPrompt(profile: Record<string, unknown>, macros: MacroTargets, timing: TimingConfig, foodType: string, notes: string): string {
  const dp = String(profile.dietary_pattern || "vegetarian").toLowerCase();
  let dietRule = "";
  if (dp === "vegetarian") dietRule = "STRICTLY VEGETARIAN. FATAL ERROR IF YOU USE EGGS, MEAT, OR CHICKEN. Use ONLY Paneer, Soya, Dal, Curd, Whey.";
  else if (dp === "vegan") dietRule = "STRICTLY VEGAN. NO DAIRY, NO EGGS. Use Tofu, Soya, Dal.";
  else if (dp === "eggetarian") dietRule = "EGGETARIAN. Eggs allowed. NO MEAT/CHICKEN. Use Eggs, Paneer, Soya, Dal, Curd.";
  else dietRule = "NON-VEG allowed. Use Chicken, Fish, Eggs, Paneer, Soya.";

  const mealTargets = timing.kcalSplit.map((frac, i) => {
    const p = Math.round(macros.protein_g * frac);
    const c = Math.round(macros.carbs_g * frac);
    const f = Math.round(macros.fat_g * frac);
    const k = Math.round(macros.calories * frac);
    return `Meal ${i + 1} (${timing.names[i]}): ${k} kcal | ${p}g Protein | ${c}g Carbs | ${f}g Fat`;
  }).join("\n");

  return `Generate a 4-day Indian diet plan (Mon, Tue, Wed, Thu).
TARGETS: ${macros.calories}kcal, ${macros.protein_g}g Protein, ${macros.carbs_g}g Carbs, ${macros.fat_g}g Fat. Goal: ${sanitizeField(profile.primary_goal)}. Food style: ${foodType}.
${notes ? `CRITICAL USER FEEDBACK/NOTES: ${notes}` : ""}

CRITICAL RULES:
1. DIET: ${dietRule}
2. SCHEDULE: Exactly ${timing.count} meals per day. 
   STRICT PER-MEAL TARGETS:
   ${mealTargets}
3. MACRO ACCURACY: The sum of food macros MUST EXACTLY equal the meal macros.
4. "protein_g", "carbs_g", "fat_g", "kcal" MUST be pure integers (e.g., 15), NOT strings.
5. "quantity" MUST be exact grams (e.g. "100g", "60g dry"). Never "bowl".

OUTPUT JSON SCHEMA:
{
  "weekly_rules": { "protein_strategy": "...", "refeed_day": "...", "steps_target": "...", "sleep_protocol": "...", "water_target": "..." },
  "weekly_meals": [
    {
      "day": "Monday", "day_name": "Monday", "type": "standard",
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Error("Unauthorized");
    const tokenHash = await hashTokenDeno(authHeader.replace("Bearer ", "").trim());
    const { data: session } = await supabaseAdmin.from("sessions").select("user_id").eq("token_hash", tokenHash).gt("expires_at", new Date().toISOString()).maybeSingle();
    if (!session) throw new Error("Invalid session");

    const userId = session.user_id;
    const { data: profile } = await supabaseAdmin.from("profiles").select("*").eq("user_id", userId).single();
    if (!profile) throw new Error("Profile not found");

    const timingPref = String(profile.meal_timing || "4_meals").toLowerCase();
    const timing = getMealTimingConfig(timingPref);
    const macros = calcMacros(profile);
    const foodType = String(body.food_type || profile.food_type || "indian");
    const notes = String(body.notes || "").slice(0, 500);

    const [dietResult, workoutResult] = await Promise.allSettled([
      callDeepSeek(buildDietPrompt(profile, macros, timing, foodType, notes), 6000),
      callDeepSeek(buildWorkoutPrompt(), 3500)
    ]);

    let dietRaw = dietResult.status === "fulfilled" && dietResult.value.content ? safeParseJSON(dietResult.value.content) : null;
    
    if (dietRaw) {
      dietRaw = expandToSevenDays(dietRaw, macros);
    } else {
      dietRaw = getFallbackDiet(macros, profile, timing);
    }
    
    // Always run through the auto-scaler to guarantee 100% macro accuracy
    dietRaw = validateAndScaleMacros(dietRaw, macros);

    let workoutData = workoutResult.status === "fulfilled" && workoutResult.value.content ? safeParseJSON(workoutResult.value.content) : null;
    if (!workoutData || !workoutData.workout_plan) {
      workoutData = getFallbackWorkout();
    }

    const fullPlan = { ...dietRaw, workout_plan: workoutData.workout_plan, lifestyle_rules: workoutData.lifestyle_rules || (dietRaw as any).weekly_rules, daily_macros: macros };

    const { count } = await supabaseAdmin.from("meal_plans").select("*", { count: "exact", head: true }).eq("user_id", userId);
    await supabaseAdmin.from("meal_plans").upsert({ user_id: userId, plan_week: (count || 0) + 1, plan_json: fullPlan, food_type: foodType, meal_count: timing.count, generated_at: new Date().toISOString() }, { onConflict: "user_id,plan_week" });
    await supabaseAdmin.from("users").update({ onboarding_completed: true }).eq("id", userId);

    return new Response(JSON.stringify({ success: true, plan: fullPlan }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});