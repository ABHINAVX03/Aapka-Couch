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

// (include the same helper functions: safeNum, sanitizeField, hashTokenDeno, safeParseJSON, callDeepSeek, and the fallback workout/lifestyle functions from your previous code)

// For brevity, I'll give you the main handler – you already have the helpers and fallbacks in your existing code. Copy them into this file.

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Auth (same pattern)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const token = authHeader.replace("Bearer ", "").trim();
    const tokenHash = await hashTokenDeno(token);
    const { data: session } = await supabaseAdmin.from("sessions").select("user_id").eq("token_hash", tokenHash).gt("expires_at", new Date().toISOString()).maybeSingle();
    if (!session) return new Response(JSON.stringify({ error: "Invalid session" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const userId = session.user_id;

    // Fetch profile and latest plan
    const { data: profile } = await supabaseAdmin.from("profiles").select("*").eq("user_id", userId).single();
    if (!profile) return new Response(JSON.stringify({ error: "Profile not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: latestPlan } = await supabaseAdmin.from("meal_plans").select("*").eq("user_id", userId).order("generated_at", { ascending: false }).limit(1).maybeSingle();
    if (!latestPlan) return new Response(JSON.stringify({ error: "No diet plan found – generate diet first" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Build workout prompt (use the same buildWorkoutPrompt function from your previous code)
    const workoutPrompt = buildWorkoutPrompt(profile, { tdee: 2000, calories: 2000 }); // pass a dummy macros object if needed, or refactor to not need macros
    const result = await callDeepSeek(workoutPrompt, 3500, 0.25);

    let workoutPlan, lifestyleRules;
    if (result.content) {
      const parsed = safeParseJSON(result.content);
      if (parsed) {
        workoutPlan = parsed.workout_plan || getFallbackWorkout(profile, {} as any);
        lifestyleRules = parsed.lifestyle_rules || getFallbackLifestyle({} as any);
      } else {
        workoutPlan = getFallbackWorkout(profile, {} as any);
        lifestyleRules = getFallbackLifestyle({} as any);
      }
    } else {
      workoutPlan = getFallbackWorkout(profile, {} as any);
      lifestyleRules = getFallbackLifestyle({} as any);
    }

    // Update the plan with workout & lifestyle
    const updatedPlan = { ...(latestPlan.plan_json as any), workout_plan: workoutPlan, lifestyle_rules: lifestyleRules };
    await supabaseAdmin.from("meal_plans").update({ plan_json: updatedPlan }).eq("id", latestPlan.id);

    return new Response(JSON.stringify({ success: true, workout_plan: workoutPlan, lifestyle_rules: lifestyleRules }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});