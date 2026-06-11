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
function clamp(val: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, val));
}
async function hashTokenDeno(token: string): Promise<string> {
    const enc = new TextEncoder().encode(token);
    const digest = await crypto.subtle.digest("SHA-256", enc);
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ─────────────────────────────────────────────
// MACROS — Katch‑McArdle for recomp
// ─────────────────────────────────────────────
function calcMacros(profile: Record<string, unknown>) {
    const weightKg = safeNum(profile.weight_kg, 70);
    const heightCm = safeNum(profile.height_cm, 170);
    const age = safeNum(profile.age, 25);
    const sex = String(profile.sex || "male").toLowerCase();
    const bodyFatPct = clamp(safeNum(profile.body_fat_percent, 20), 5, 55);
    const activity = String(profile.activity_level || "moderate").toLowerCase();
    const goal = String(profile.primary_goal || "recomp").toLowerCase();
    const mealCount = clamp(safeNum(profile.meal_count, 4), 3, 6);

    // LBM‑based BMR (Katch‑McArdle)
    const lbmKg = weightKg * (1 - bodyFatPct / 100);
    const bmr = Math.round(370 + 21.6 * lbmKg);

    // TDEE
    const palMap: Record<string, number> = {
        sedentary: 1.2, light: 1.375, moderate: 1.55,
        active: 1.725, very_active: 1.725, extra_active: 1.9,
    };
    const palKeys = Object.keys(palMap).sort((a, b) => b.length - a.length);
    let pal = 1.55;
    for (const k of palKeys) {
        if (activity === k || activity === k.replace("_", " ")) { pal = palMap[k]; break; }
    }
    const tdee = Math.round(bmr * pal);

    const isFatLoss = goal.includes("fat") || goal.includes("loss") || goal.includes("cut");
    const isMuscle = goal.includes("muscle") || goal.includes("bulk") || goal.includes("gain");
    const isRecomp = goal.includes("recomp") || (!isFatLoss && !isMuscle);

    let targetCalories: number;
    let note: string;
    if (isFatLoss) {
        targetCalories = Math.round(tdee * 0.80);
        note = `Fat loss: ~${tdee - targetCalories} kcal deficit from TDEE (${tdee}).`;
    } else if (isMuscle) {
        targetCalories = Math.round(tdee * 1.10);
        note = `Lean bulk: ~${targetCalories - tdee} kcal surplus above TDEE (${tdee}).`;
    } else {
        targetCalories = Math.max(tdee - 280, sex === "female" ? 1400 : 1700);
        note = `Recomp: ~280 kcal deficit from TDEE (${tdee}).`;
    }

    // Protein: 2.2 g/kg for recomp/cut, 1.8 for bulk
    const proteinG = Math.round(weightKg * ((isRecomp || isFatLoss) ? 2.2 : 1.8));

    // Fat: 1.0 g/kg
    const fatG = clamp(Math.round(weightKg * 1.0), 55, 110);

    // Carbs: remainder
    const carbsG = Math.max(Math.round((targetCalories - proteinG * 4 - fatG * 9) / 4), 80);

    // Fiber
    const fiberG = clamp(Math.round(carbsG * 0.14), 20, 40);

    const actualCalories = proteinG * 4 + fatG * 9 + carbsG * 4;

    return {
        calories: actualCalories,
        protein_g: proteinG,
        carbs_g: carbsG,
        fat_g: fatG,
        fiber_g: fiberG,
        tdee,
        bmr,
        note,
        lbm_kg: Math.round(lbmKg * 10) / 10,
    };
}

// ─────────────────────────────────────────────
// VALIDATION
// ─────────────────────────────────────────────
function validateDietPlan(p: unknown) {
    if (!p || typeof p !== "object") return false;
    const plan = p as Record<string, unknown>;
    const dm = plan.daily_macros as Record<string, unknown>;
    if (!dm || typeof dm !== "object") return false;
    for (const k of ["calories", "protein_g", "carbs_g", "fat_g"]) {
        if (typeof dm[k] !== "number" || !isFinite(dm[k] as number)) return false;
    }
    if (!Array.isArray(plan.weekly_meals) || (plan.weekly_meals as unknown[]).length < 6) return false;
    for (const day of plan.weekly_meals as unknown[]) {
        const d = day as Record<string, unknown>;
        if (!d || !Array.isArray(d.meals) || (d.meals as unknown[]).length === 0) return false;
        for (const meal of d.meals as unknown[]) {
            const m = meal as Record<string, unknown>;
            if (!m || !Array.isArray(m.foods) || (m.foods as unknown[]).length === 0) return false;
        }
    }
    return true;
}

// ─────────────────────────────────────────────
// JSON PARSER
// ─────────────────────────────────────────────
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

// ─────────────────────────────────────────────
// DEEPSEEK CALL
// ─────────────────────────────────────────────
async function callDeepSeek(prompt: string, maxTokens = 16000, temperature = 0.25) {
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
                    { role: "system", content: "You are a precision Indian sports dietitian. Return ONLY valid JSON. No markdown. No explanations." },
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

// ─────────────────────────────────────────────
// MAIN HANDLER
// ─────────────────────────────────────────────
serve(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    const startTime = Date.now();

    try {
        // ── AUTH ──
        const authHeader = req.headers.get("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const token = authHeader.replace("Bearer ", "").trim();
        const tokenHash = await hashTokenDeno(token);
        const { data: session } = await supabaseAdmin.from("sessions").select("user_id").eq("token_hash", tokenHash).gt("expires_at", new Date().toISOString()).maybeSingle();
        if (!session) return new Response(JSON.stringify({ error: "Invalid session" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

        const userId = session.user_id;

        // ── PROFILE ──
        const { data: profile, error: profileError } = await supabaseAdmin.from("profiles").select("*").eq("user_id", userId).single();
        if (profileError || !profile) return new Response(JSON.stringify({ error: "Profile not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

        const body = await req.json().catch(() => ({})) as Record<string, unknown>;
        const notes = typeof body.notes === "string" ? body.notes.slice(0, 500) : "";
        const foodType = (typeof body.food_type === "string" ? body.food_type.trim().toLowerCase() : "") || String(profile.food_type || "").toLowerCase() || "indian";
        const mealCount = clamp(safeNum(body.meal_count ?? profile.meal_count, 4), 3, 6);

        // ── MACROS ──
        const macros = calcMacros({ ...profile, meal_count: mealCount });

        // ── DERIVE CONTEXT FLAGS ──
        const isEggetarian = String(profile.dietary_pattern || "").toLowerCase().includes("egg");
        const hasWhey = safeNum(profile.uses_whey, 1) === 1;
        const trainingDays = safeNum(profile.training_days_per_week, 5);
        const wakeTime = sanitizeField(profile.wake_time || "07:00");
        const sleepTime = sanitizeField(profile.sleep_time || "23:00");
        const fastingHours = safeNum(profile.fasting_hours, 14);
        const firstMealTime = sanitizeField(profile.first_meal_time || "11:00");
        const lastMealTime = sanitizeField(profile.last_meal_time || "21:00");
        const gymTime = sanitizeField(profile.gym_time || "17:00");
        const budget = safeNum(profile.daily_budget, 150);

        const proteinSources = isEggetarian
            ? "eggs (whole + whites), paneer, dal (masoor/moong/chana), curd/dahi, soya chunks, rajma, chana, whey protein"
            : "paneer, dal (masoor/moong/chana), curd/dahi, soya chunks, rajma, chana, tofu";

        const carbStrategy = `
CARB TIMING RULES (mandatory):
- Pre-workout meal (${gymTime} - 1.5 hrs): 40-50% of daily carbs here (rice + banana or oats)
- Post-workout meal: moderate carbs (sweet potato or 1 roti) + high protein
- First meal (break-fast): protein + fat dominant, LOW carbs (eggs, dahi, nuts)
- Last meal: near-zero carbs, high protein only (chilla, eggs, dahi)
- Carbs come from: rice (cooked 115g = 31g carbs), roti (1 whole wheat = 15g carbs), 
  banana (1 medium = 25g carbs), oats (40g dry = 27g carbs), sweet potato (150g = 28g carbs)
`;

        const portionRef = `
MANDATORY PORTION SIZES (use exactly, do not deviate):
- Whole egg: 1 egg = P6g C0g F5g, 72kcal, ₹6
- Egg white: 1 white = P3.5g C0g F0g, 17kcal, ₹3
- Paneer: 100g = P18g C3g F21g, 265kcal, ₹30
- Whey protein (1 scoop = 30g): P24g C3g F1.5g, 120kcal, ₹50
- Curd/dahi full fat (150g): P5g C7g F4g, 84kcal, ₹12
- Moong dal cooked (150g): P7g C16g F0.5g, 97kcal, ₹8
- Masoor dal cooked (150g): P8g C17g F0.5g, 105kcal, ₹8
- Rice cooked (115g): P2.5g C31g F0g, 135kcal, ₹5
- Roti whole wheat (1 piece = 30g dry): P3g C15g F0.5g, 77kcal, ₹4
- Soya chunks dry (30g): P13g C11g F0.5g, 101kcal, ₹5
- Banana medium (1 = 100g): P1g C25g F0g, 89kcal, ₹5
- Oats (40g dry): P5g C27g F3g, 155kcal, ₹8
- Sweet potato boiled (150g): P2g C28g F0g, 122kcal, ₹8
- Mixed nuts almonds+walnuts (30g): P6g C5g F17g, 196kcal, ₹24
- Sattu (30g dry): P6g C20g F1.5g, 117kcal, ₹6
- Peanut butter (20g): P5g C3g F10g, 120kcal, ₹8
- Milk full fat (200ml): P6g C9g F7g, 126kcal, ₹12
- Spinach/palak sautéed (100g cooked): P2.5g C4g F3g, 55kcal, ₹8
- Cucumber + tomato salad (100g): P1g C4g F0g, 20kcal, ₹5
`;

        const prompt = `
You are a precision Indian sports dietitian generating a 7-day recomp meal plan. 
Return ONLY valid JSON. No markdown. No explanations.

PERSON:
- Age: ${safeNum(profile.age, 23)}, Sex: ${sanitizeField(profile.sex || "male")}
- Weight: ${safeNum(profile.weight_kg, 74)}kg, Height: ${safeNum(profile.height_cm, 172)}cm
- Body fat: ${safeNum(profile.body_fat_percent, 17)}% → Target: 13-14%
- LBM: ${macros.lbm_kg}kg
- TDEE: ${macros.tdee} kcal (BMR: ${macros.bmr})
- Goal: Body recomposition — fat loss + muscle retention
- Setting: Hostel/PG in India, cooks on induction, limited utensils
${notes ? `- Special requirements: ${notes}` : ""}

DAILY TARGETS (these are FIXED — every day must hit within ±5%):
- Calories: ${macros.calories} kcal
- Protein: ${macros.protein_g}g (NON-NEGOTIABLE — must be met daily)
- Carbs: ${macros.carbs_g}g
- Fat: ${macros.fat_g}g
- Fiber: ${macros.fiber_g}g
- Budget: ₹${budget}/day

SCHEDULE:
- Wake: ${wakeTime}, Sleep: ${sleepTime}
- Intermittent fasting: ${fastingHours}hr fast, eating window ${firstMealTime}–${lastMealTime}
- Training: ${trainingDays} days/week at ${gymTime}
- Training days (Mon/Tue/Wed/Fri/Sat): higher carbs around gym
- Rest days (Thu/Sun): reduce carbs by ~40g, keep protein same

DIET TYPE:
- ${isEggetarian ? "Eggetarian (eggs allowed, no chicken/fish/meat)" : "Vegetarian (no eggs or meat)"}
- ${hasWhey ? "Uses 1 scoop whey protein daily (post-workout or morning)" : "No whey protein"}
- Protein sources: ${proteinSources}

${carbStrategy}

${portionRef}

MEAL STRUCTURE (${mealCount} meals, same time slots every day):
1. First meal at ${firstMealTime} — break-fast (protein + fat dominant)
2. ~14:00 — afternoon snack (protein + small carb or fat)
3. ~${String(Number(gymTime.split(':')[0]) - 1).padStart(2, '0')}:30 — pre-workout (carb heavy)
4. ~${String(Number(gymTime.split(':')[0]) + 2).padStart(2, '0')}:00 — post-workout (protein + moderate carb)
${mealCount >= 5 ? `5. ${lastMealTime} — dinner (protein + minimal carbs)` : ""}
${mealCount >= 6 ? `6. 22:30 — pre-sleep (casein-type: dahi/milk + nuts)` : ""}

VARIETY RULES:
- 7 different breakfasts across the week (eggs in different forms: boiled, scrambled bhurji, omelette, etc.)
- Rotate dal types: moong Monday, masoor Tuesday, chana dal Wednesday, etc.
- At least 1 green vegetable per day (palak, beans, broccoli, lauki)
- Sunday: refeed day — calories +300 (add extra rice/banana/apple), same protein

ACCURACY RULES (CRITICAL):
- Sum protein_g + carbs_g + fat_g for every meal → verify against meal kcal: (P×4 + C×4 + F×9)
- Sum all meals for each day → verify equals daily_macros within ±20 kcal
- Do NOT invent food macros. Use ONLY the portion reference above.
- Each food item must include: name, quantity_str, protein_g, carbs_g, fat_g, fiber_g, kcal, cost_inr
- Include a "meal_tip" string for each meal (practical 1-sentence tip)
- Include a "meal_type" field: "brunch"|"snack"|"pre_workout"|"post_workout"|"dinner"|"pre_sleep"

OUTPUT JSON STRUCTURE:
{
  "daily_macros": {
    "calories": ${macros.calories},
    "protein_g": ${macros.protein_g},
    "carbs_g": ${macros.carbs_g},
    "fat_g": ${macros.fat_g},
    "fiber_g": ${macros.fiber_g},
    "tdee": ${macros.tdee},
    "note": "${macros.note}"
  },
  "weekly_rules": {
    "egg_strategy": "string",
    "refeed_day": "string",
    "carb_cycling": "string",
    "steps_target": "string",
    "water_target": "string"
  },
  "weekly_meals": [
    {
      "day": 1,
      "day_name": "Monday",
      "is_training_day": true,
      "fasting_window": "22:00 prev → ${firstMealTime}",
      "day_note": "Egg day / Training day",
      "day_totals": { "calories": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0 },
      "meals": [
        {
          "meal_number": 1,
          "meal_name": "Brunch",
          "meal_type": "brunch",
          "time": "${firstMealTime}",
          "meal_totals": { "calories": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0 },
          "meal_tip": "string",
          "foods": [
            {
              "name": "Boiled Eggs",
              "quantity_str": "3 whole",
              "protein_g": 18,
              "carbs_g": 1.5,
              "fat_g": 15,
              "fiber_g": 0,
              "kcal": 216,
              "cost_inr": 18
            }
          ]
        }
      ]
    }
  ]
}

Generate all 7 days. Ensure every day's meal sum matches daily_macros within ±20 kcal. Protein must be ≥${macros.protein_g - 5}g every single day. No exceptions.
`.trim();

        // ── CALL DEEPSEEK ──
        let result = await callDeepSeek(prompt, 16000, 0.25);
        if (!result.content) throw new Error("Empty AI response");

        let planRaw = safeParseJSON(result.content);
        if (!planRaw) throw new Error("Unparseable JSON from AI");

        const planData = (planRaw.plan ?? planRaw) as Record<string, unknown>;
        if (!planData.weekly_meals) throw new Error("Missing weekly_meals");

        // Always override macros with our authoritative server calculation
        planData.daily_macros = {
            calories: macros.calories,
            protein_g: macros.protein_g,
            carbs_g: macros.carbs_g,
            fat_g: macros.fat_g,
            fiber_g: macros.fiber_g,
            tdee: macros.tdee,
            bmr: macros.bmr,
            note: macros.note,
        };

        if (!validateDietPlan(planData)) throw new Error("Validation failed");

        // ── SAVE ──
        const { count } = await supabaseAdmin.from("meal_plans").select("*", { count: "exact", head: true }).eq("user_id", userId);
        const planWeek = (count ?? 0) + 1;
        await supabaseAdmin.from("meal_plans").upsert(
            { user_id: userId, plan_week: planWeek, plan_json: planData, food_type: foodType, meal_count: mealCount, generated_at: new Date().toISOString() },
            { onConflict: "user_id,plan_week" }
        );
        await supabaseAdmin.from("users").update({ onboarding_completed: true }).eq("id", userId);

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[${userId}] Diet generated in ${elapsed}s – Week ${planWeek}`);

        return new Response(JSON.stringify({ success: true, plan_week: planWeek, plan: planData }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (err: any) {
        console.error("Diet function error:", err.message);
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
});