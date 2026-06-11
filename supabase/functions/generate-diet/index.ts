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
function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}
async function hashTokenDeno(token: string): Promise<string> {
  const enc = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ---------- MACROS (same as before) ----------
function calcMacros(profile: Record<string, unknown>) {
  const weightKg = safeNum(profile.weight_kg, 70);
  const heightCm = safeNum(profile.height_cm, 170);
  const age = safeNum(profile.age, 30);
  const sex = String(profile.sex || "male").toLowerCase();
  const bodyFatPct = clamp(safeNum(profile.body_fat_percent, 20), 5, 55);
  const activity = String(profile.activity_level || "moderate").toLowerCase();
  const goal = String(profile.primary_goal || "fat_loss").toLowerCase();
  const mealCount = clamp(safeNum(profile.meal_count, 4), 3, 5);
  const budget = safeNum(profile.daily_budget, 150);
  const dietPattern = String(profile.dietary_pattern || "vegetarian").toLowerCase();
  const isVeg = !dietPattern.includes("non");

  const bmr = sex === "female"
    ? 10 * weightKg + 6.25 * heightCm - 5 * age - 161
    : 10 * weightKg + 6.25 * heightCm - 5 * age + 5;

  const palMap: Record<string, number> = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.725, extra_active: 1.9 };
  let pal = 1.55;
  for (const [k, v] of Object.entries(palMap)) { if (activity.includes(k)) { pal = v; break; } }
  const tdee = Math.round(bmr * pal);
  const lbm = weightKg * (1 - bodyFatPct / 100);

  let targetCalories: number, deficitNote: string;
  const isFatLoss = goal.includes("fat") || goal.includes("loss") || goal.includes("cut") || goal.includes("weight");
  const isMuscle = goal.includes("muscle") || goal.includes("bulk") || goal.includes("gain");

  if (isFatLoss) {
    const deficit = Math.round(tdee * 0.22);
    targetCalories = Math.max(tdee - deficit, sex === "female" ? 1200 : 1400);
    deficitNote = `Fat loss: ${tdee - targetCalories} kcal deficit from TDEE (${tdee} kcal).`;
  } else if (isMuscle) {
    targetCalories = Math.round(tdee * 1.11);
    deficitNote = `Lean bulk: ${targetCalories - tdee} kcal surplus above TDEE (${tdee} kcal).`;
  } else {
    targetCalories = tdee;
    deficitNote = `Recomp at maintenance TDEE (${tdee} kcal).`;
  }

  let proteinG = Math.round(lbm * (isFatLoss ? 1.8 : isMuscle ? 2.0 : 1.7));
  if (isVeg) proteinG = Math.min(proteinG, Math.round(lbm * 1.7));
  if (budget < 100) proteinG = Math.round(proteinG * 0.82);
  proteinG = Math.min(proteinG, Math.floor((targetCalories * 0.35) / 4), mealCount * 25);
  proteinG = Math.max(proteinG, 50);

  const fatG = clamp(Math.round(weightKg * 0.8), 45, 100);
  const carbsG = Math.max(Math.round((targetCalories - proteinG * 4 - fatG * 9) / 4), 50);
  const fiberG = clamp(Math.round(carbsG * 0.12), 18, 38);
  const actualCalories = proteinG * 4 + fatG * 9 + carbsG * 4;

  return { calories: actualCalories, protein_g: proteinG, carbs_g: carbsG, fat_g: fatG, fiber_g: fiberG, tdee, bmr: Math.round(bmr), note: deficitNote };
}

// ---------- VALIDATION ----------
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

// ---------- JSON PARSER (super‑resilient) ----------
function safeParseJSON(raw: string): Record<string, unknown> | null {
  // 1. Try direct parse
  try { return JSON.parse(raw); } catch { /* noop */ }

  // 2. Strip code fences and try
  const cleaned = raw.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  try { return JSON.parse(cleaned); } catch { /* noop */ }

  // 3. Extract first JSON object
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    const extracted = cleaned.substring(start, end + 1);
    try { return JSON.parse(extracted); } catch { /* noop */ }
  }

  // 4. Aggressive cleanup: remove all text before first { and after last }
  const aggressiveStart = raw.replace(/[\s\S]*?({)/, "$1");
  const aggressiveEnd = aggressiveStart.replace(/(})[\s\S]*$/, "$1");
  try { return JSON.parse(aggressiveEnd); } catch { /* noop */ }

  return null;
}

// ---------- DEEPSEEK CALL ----------
async function callDeepSeek(prompt: string, maxTokens = 8192, temperature = 0.25) {
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
          { role: "system", content: "You are an expert Indian dietitian. Return ONLY valid JSON. No text before or after the JSON. No markdown." },
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

// ---------- MAIN HANDLER ----------
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Auth (same as before)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const token = authHeader.replace("Bearer ", "").trim();
    const tokenHash = await hashTokenDeno(token);
    const { data: session } = await supabaseAdmin.from("sessions").select("user_id").eq("token_hash", tokenHash).gt("expires_at", new Date().toISOString()).maybeSingle();
    if (!session) return new Response(JSON.stringify({ error: "Invalid session" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const userId = session.user_id;

    // Fetch profile
    const { data: profile, error: profileError } = await supabaseAdmin.from("profiles").select("*").eq("user_id", userId).single();
    if (profileError || !profile) return new Response(JSON.stringify({ error: "Profile not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const notes = typeof body.notes === "string" ? body.notes.slice(0, 500) : "";
    const foodType = (typeof body.food_type === "string" ? body.food_type.trim().toLowerCase() : "") || String(profile.food_type || "").toLowerCase() || "indian";
    const mealCount = clamp(safeNum(body.meal_count ?? profile.meal_count, 4), 3, 5);

    const macros = calcMacros({ ...profile, meal_count: mealCount });

    // Build prompt (compact to ensure it fits within 8192 tokens)
    const prompt = `Generate a 7-day Indian ${foodType} meal plan. Macros: ${macros.calories}kcal, ${macros.protein_g}g P, ${macros.carbs_g}g C, ${macros.fat_g}g F, ${macros.fiber_g}g fiber. ${mealCount} meals/day. Budget ₹${safeNum(profile.daily_budget, 150)}/day. ${String(profile.dietary_pattern || "").includes("non") ? "Non‑veg allowed." : "Vegetarian only."} Use only these proteins: ${String(profile.dietary_pattern || "").includes("egg") ? "eggs, paneer, dal, soya, curd" : "paneer, dal, soya, curd, rajma, chana"}. Portions: roti 30g, rice 150g cooked, dal 150ml, paneer 100g, curd 150g. Each food MUST have: name, quantity, protein_g, carbs_g, fat_g, fiber_g, kcal, cost_inr. Return ONLY valid JSON with keys daily_macros and weekly_meals. No extra text.`;

    const result = await callDeepSeek(prompt, 8192, 0.25);
    if (!result.content) throw new Error("Empty AI response");

    const dietRaw = safeParseJSON(result.content);
    if (!dietRaw) throw new Error("Unparseable JSON from AI");

    const planData = (dietRaw.plan ?? dietRaw) as Record<string, unknown>;
    if (!planData.weekly_meals) throw new Error("Missing weekly_meals");

    planData.daily_macros = { calories: macros.calories, protein_g: macros.protein_g, carbs_g: macros.carbs_g, fat_g: macros.fat_g, fiber_g: macros.fiber_g };

    if (!validateDietPlan(planData)) throw new Error("Validation failed");

    // Save
    const { count } = await supabaseAdmin.from("meal_plans").select("*", { count: "exact", head: true }).eq("user_id", userId);
    const planWeek = (count ?? 0) + 1;
    await supabaseAdmin.from("meal_plans").upsert({ user_id: userId, plan_week: planWeek, plan_json: planData, food_type: foodType, meal_count: mealCount, generated_at: new Date().toISOString() }, { onConflict: "user_id,plan_week" });
    await supabaseAdmin.from("users").update({ onboarding_completed: true }).eq("id", userId);

    return new Response(JSON.stringify({ success: true, plan_week: planWeek, plan: planData }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});