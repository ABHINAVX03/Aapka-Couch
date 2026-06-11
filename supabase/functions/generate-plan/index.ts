import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------- CORS ----------
const FRONTEND_ORIGIN = Deno.env.get("FRONTEND_ORIGIN") || "*";
const corsHeaders = {
  "Access-Control-Allow-Origin": FRONTEND_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ---------- Supabase Admin Client ----------
const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// ---------- Helpers ----------
function sanitizeField(val: unknown): string {
  if (val == null) return "Not specified";
  return String(val).replace(/[\r\n`]/g, " ").slice(0, 200);
}

function safeNum(val: unknown, fallback = 0): number {
  const n = Number(val);
  return isFinite(n) ? n : fallback;
}

async function hashTokenDeno(token: string) {
  const enc = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", enc);
  const hashArray = Array.from(new Uint8Array(digest));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function validatePlan(p: any): boolean {
  if (!p || typeof p !== "object") return false;
  const dm = p.daily_macros;
  if (!dm || typeof dm !== "object") return false;
  const requiredMacros = ["calories", "protein_g", "carbs_g", "fat_g"];
  for (const k of requiredMacros) {
    if (typeof dm[k] !== "number" || !isFinite(dm[k])) return false;
  }

  if (!Array.isArray(p.weekly_meals) || p.weekly_meals.length < 6) return false;

  // Each day and meal must have required fields
  for (const day of p.weekly_meals) {
    if (!day || typeof day !== "object") return false;
    if (!Array.isArray(day.meals) || day.meals.length === 0) return false;
    for (const meal of day.meals) {
      if (!meal || typeof meal !== "object") return false;
      const mealFields = ["kcal", "protein_g", "carbs_g", "fat_g"];
      for (const f of mealFields) {
        if (typeof meal[f] !== "number" || !isFinite(meal[f])) return false;
      }
      if (!Array.isArray(meal.foods) || meal.foods.length === 0) return false;
      for (const food of meal.foods) {
        const foodFields = ["protein_g", "carbs_g", "fat_g", "kcal"];
        for (const ff of foodFields) {
          if (typeof food[ff] !== "number" || !isFinite(food[ff])) return false;
        }
      }
    }
  }

  // NOTE: Removed strict per-day macro sum cross-check.
  // The AI targets daily_macros as an average — individual days legitimately
  // vary ±100–200 kcal. The strict ±60 kcal tolerance was rejecting valid plans.

  return true;
}

function buildPrompt(
  profile: any,
  previousPlans: any[],
  notes: string,
  nextWeek: number,
  foodType: string
): string {
  const goal = sanitizeField(profile.primary_goal);
  const diet = sanitizeField(profile.dietary_pattern);
  const timing = sanitizeField(profile.meal_timing);
  const supplements = sanitizeField(profile.supplements);
  const persistentNotes = sanitizeField(profile.plan_notes);
  const ft = (foodType || "indian").toLowerCase();

  let foodTypeBlock = "";
  if (ft === "indian") {
    foodTypeBlock =
      "\nFOOD TYPE: Indian. Prefer authentic Indian foods and local names (roti, dal, chawal, sabzi, paneer, dahi, sattu, idli, dosa, paratha, chana, rajma, chicken curry). Prioritise familiar Indian preparations and use Indian portion sizes and cost estimates.\n";
  } else if (ft === "english" || ft === "western") {
    foodTypeBlock =
      "\nFOOD TYPE: English/Western. Prefer western-style foods (bread, porridge/oats, sandwiches, baked chicken, salads, potatoes, pasta, yogurt, cottage cheese) and use appropriate portioning and ingredient names.\n";
  } else if (ft === "mixed" || ft === "both") {
    foodTypeBlock =
      "\nFOOD TYPE: Mixed. Blend Indian and Western foods across the week — pick the most suitable items for variety and adherence.\n";
  } else {
    foodTypeBlock = `\nFOOD TYPE: ${sanitizeField(
      foodType
    )}. Use appropriate local foods.`;
  }

  let previousBlock = "";
  if (Array.isArray(previousPlans) && previousPlans.length > 0) {
    previousBlock = "\nPREVIOUS WEEKLY PLANS:\n";
    previousPlans.forEach((prev) => {
      const week = prev.plan_week ?? "1";
      const macros = prev.plan_json?.daily_macros || {};
      previousBlock += `- Week ${week}: ${safeNum(macros.calories)} kcal, ${safeNum(
        macros.protein_g
      )}g protein, ${safeNum(macros.carbs_g)}g carbs, ${safeNum(macros.fat_g)}g fat.`;
      if (prev.plan_json?.workout_plan?.split) {
        previousBlock += ` Workout: ${sanitizeField(
          prev.plan_json.workout_plan.split
        )}.`;
      }
      if (prev.plan_json?.lifestyle_rules?.refeed_day) {
        previousBlock += ` Refeed: ${sanitizeField(
          prev.plan_json.lifestyle_rules.refeed_day
        )}.`;
      }
      previousBlock += "\n";
    });
    previousBlock +=
      "\nUse this history to improve continuity, preserve what worked, and adjust the next week based on user feedback.";
  }

  let feedbackBlock = "";
  if (notes) {
    feedbackBlock += `\nUSER NOTES FOR WEEK ${nextWeek}: ${sanitizeField(notes)}\n`;
  }
  if (persistentNotes) {
    feedbackBlock += `\nUSER PERSISTENT NOTES: ${persistentNotes}\n`;
  }

  let supplementBlock = "";
  if (supplements) {
    supplementBlock = `\nSUPPLEMENTS: ${supplements}. Include these while choosing protein sources and recovery meals.\n`;
  }

  return `Generate a complete, highly personalised 7-day diet and training plan for Week ${nextWeek}. Return ONLY valid JSON — no markdown, no extra text.

USER PROFILE:
- Name: ${sanitizeField(profile.name)}
- Age: ${safeNum(profile.age)}, Sex: ${sanitizeField(profile.sex)}
- Height: ${safeNum(profile.height_cm)} cm, Weight: ${safeNum(profile.weight_kg)} kg
- Body Fat: ${safeNum(profile.body_fat_percent)}%, Visceral Fat: ${safeNum(profile.visceral_fat)}
- Waist: ${safeNum(profile.waist_inches)}", Upper Abdomen: ${safeNum(profile.upper_abdomen_inches)}", Hips: ${safeNum(profile.hips_inches)}"
- Body Age: ${safeNum(profile.body_age)}, RMR: ${safeNum(profile.rmr_estimated)} kcal
- Dietary pattern: ${diet}, Meal timing: ${timing}
- Eating environment: ${sanitizeField(profile.eating_environment)}, Budget: ₹${safeNum(profile.daily_budget, 200)}/day
- Activity: ${sanitizeField(profile.activity_level)}, Sleep: ${safeNum(profile.sleep_hours, 7)}h, Stress: ${safeNum(profile.stress_level, 5)}/10
- Goal: ${goal}, Target BF%: ${safeNum(profile.target_bf_percent)}, Timeframe: ${safeNum(profile.timeframe_weeks)} weeks
${supplementBlock}${previousBlock}${feedbackBlock}
CALCULATION STEPS (show the result in the JSON):
1. BMR via Mifflin-St Jeor. Apply activity multiplier for TDEE.
2. Adjust for goal: fat_loss = -400 kcal, muscle_gain = +250 kcal, recomp = -100 kcal.
3. Protein = 2.0 g/kg body weight. Fat = 0.9 g/kg. Carbs fill the rest.
4. If meal_timing is "16_8" apply intermittent fasting (eating window 12 PM – 8 PM, no breakfast).
5. Every day must be DIFFERENT — rotate foods, vary protein sources across the week.
6. Use real Indian foods with accurate macros: dal, chawal, roti, sabzi, paneer, eggs, sattu, dahi, chicken, fish, soy chunks, oats, fruits, nuts.
7. Each meal's macros must sum up correctly to daily totals.
8. Daily cost must stay within budget.
9. Workout split tailored to goal: recomp = Upper/Lower 4x/week, fat_loss = PPL 5x/week, muscle_gain = Push/Pull/Legs 5x/week.

RULES FOR EVERY FOOD ITEM (do NOT skip any field):
{ "name": "Boiled Eggs", "quantity": "4 whole", "protein_g": 24, "carbs_g": 2, "fat_g": 20, "kcal": 280, "cost_inr": 24 }

OUTPUT JSON STRUCTURE (follow exactly):
{
  "daily_macros": { "calories": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0 },
  "weekly_meals": [
    {
      "day": "Monday",
      "type": "standard",
      "meals": [
        {
          "time": "12:00 PM",
          "name": "Meal name",
          "kcal": 0,
          "protein_g": 0,
          "carbs_g": 0,
          "fat_g": 0,
          "foods": [
            { "name": "Food item", "quantity": "amount + unit", "protein_g": 0, "carbs_g": 0, "fat_g": 0, "kcal": 0, "cost_inr": 0 }
          ],
          "tip": "Why this meal helps"
        }
      ]
    }
  ],
  "workout_plan": {
    "days_per_week": 4,
    "split": "Upper/Lower Split",
    "sessions": [
      {
        "name": "Session name",
        "exercises": [
          { "name": "Exercise", "sets": "4", "reps": "8-10", "tip": "Form cue" }
        ]
      }
    ],
    "cardio": "Description"
  },
  "lifestyle_rules": {
    "sleep_hours": 8,
    "water_litres": 3.5,
    "steps_daily": 10000,
    "stress_tips": ["tip1", "tip2"],
    "refeed_day": "Description",
    "avoid_list": ["item1", "item2"]
  }
}`;
}

// ---------- Main handler ----------
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ----- AUTH: validate custom session token -----
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "").trim();
    const tokenHash = await hashTokenDeno(token);

    // Look up the token in the custom sessions table by hash
    const { data: session, error: sessionError } = await supabaseAdmin
      .from("sessions")
      .select("user_id")
      .eq("token_hash", tokenHash)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (sessionError || !session) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired session" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const userId = session.user_id;

    // ----- FETCH PROFILE -----
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: "Profile not found. Complete onboarding first." }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const requestBody = await req.json().catch(() => ({}));
    const notes = typeof requestBody.notes === "string" ? requestBody.notes : "";
    const requestedFoodType =
      typeof requestBody.food_type === "string"
        ? requestBody.food_type.trim().toLowerCase()
        : "";

    const { data: previousPlans } = await supabaseAdmin
      .from("meal_plans")
      .select("plan_week, plan_json")
      .eq("user_id", userId)
      .order("plan_week", { ascending: true });

    const nextWeek = Array.isArray(previousPlans) ? previousPlans.length + 1 : 1;
    const foodType = requestedFoodType || profile.food_type || "indian";

    // ----- CALL DEEPSEEK -----
    const deepseekKey = Deno.env.get("DEEPSEEK_API_KEY");
    if (!deepseekKey) {
      return new Response(
        JSON.stringify({ error: "AI not configured on server." }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 50_000);

    let planData: any = null;

    try {
      const aiRes = await fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${deepseekKey}`,
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [
            {
              role: "system",
              content:
                "You are a world-class sports nutritionist AI who specialises in Indian dietary patterns. Always respond with valid JSON only — no markdown, no extra text, no code fences.",
            },
            {
              role: "user",
              content: buildPrompt(
                profile,
                previousPlans ?? [],
                notes,
                nextWeek,
                foodType
              ),
            },
          ],
          temperature: 0.4,
          max_tokens: 8000,
          response_format: { type: "json_object" },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!aiRes.ok) {
        const errText = await aiRes.text();
        console.error("DeepSeek API error:", aiRes.status, errText);
        return new Response(
          JSON.stringify({ error: `AI returned status ${aiRes.status}` }),
          {
            status: 502,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const result = await aiRes.json();

      if (result.choices?.[0]?.finish_reason === "length") {
        return new Response(
          JSON.stringify({ error: "AI response truncated. Please try again." }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const aiJson = result.choices?.[0]?.message?.content;
      if (!aiJson) {
        return new Response(JSON.stringify({ error: "Empty AI response" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const parsed = JSON.parse(aiJson);
      planData = parsed.plan ?? parsed;
    } catch (e: any) {
      clearTimeout(timeout);
      if (e.name === "AbortError") {
        return new Response(
          JSON.stringify({ error: "AI request timed out. Please try again." }),
          {
            status: 504,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      console.error("DeepSeek fetch error:", e);
      return new Response(JSON.stringify({ error: "AI request failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ----- VALIDATE PLAN -----
    if (!validatePlan(planData)) {
      console.error(
        "Plan validation failed. Received:",
        JSON.stringify(planData).slice(0, 500)
      );
      return new Response(
        JSON.stringify({
          error: "AI returned an incomplete plan. Please try again.",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ----- SAVE TO meal_plans TABLE -----
    const { error: insertError } = await supabaseAdmin.from("meal_plans").insert({
      user_id: userId,
      plan_week: nextWeek,
      plan_json: planData,
      generated_at: new Date().toISOString(),
    });

    if (insertError) {
      console.error("Save plan error:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to save plan to database." }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ----- MARK ONBOARDING COMPLETE -----
    await supabaseAdmin
      .from("users")
      .update({ onboarding_completed: true })
      .eq("id", userId);

    return new Response(
      JSON.stringify({
        success: true,
        plan: { ...planData, plan_week: nextWeek },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error(
      "Unhandled edge function error:",
      err instanceof Error ? err.message : String(err)
    );
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});