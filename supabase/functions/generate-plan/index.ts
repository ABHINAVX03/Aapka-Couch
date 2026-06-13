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

function ensureArray(val: any): any[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  return [val];
}

// ─────────────────────────────────────────────
// INDIAN FOOD DATABASE (Per 100g/100ml)
// ─────────────────────────────────────────────
const FOOD_DB: Record<string, [number, number, number, number]> = {
  "whey protein isolate":   [80, 4,  1,  0],
  "whey protein":           [75, 5,  2,  0],
  "paneer":                 [18, 3,  14, 0],
  "tofu":                   [16, 3,  8,  1],
  "eggs":                   [13, 1,  11, 0],
  "boiled eggs":            [13, 1,  11, 0],
  "egg whites":             [11, 1,  0,  0],
  "curd":                   [4,  4,  4,  0],
  "low fat curd":           [5,  5,  2,  0],
  "greek yogurt":           [9,  4,  0,  0],
  "chicken breast":         [31, 0,  4,  0],
  "soya chunks dry":        [52, 33, 1,  13],
  "soya chunks cooked":     [17, 11, 0,  4],
  "fish":                   [22, 0,  5,  0],
  "oats":                   [13, 66, 7,  10],
  "brown rice dry":         [7,  76, 3,  4],
  "brown rice cooked":      [3,  23, 1,  2],
  "white rice dry":         [7,  80, 1,  1],
  "white rice cooked":      [3,  28, 0,  0],
  "roti":                   [9,  45, 3,  6], 
  "chapati":                [9,  45, 3,  6],
  "wheat flour":            [12, 73, 2,  12],
  "bread brown":            [9,  41, 4,  7],
  "poha":                   [2,  76, 1,  1],
  "upma":                   [3,  18, 2,  1],
  "banana":                 [1,  23, 0,  3],
  "apple":                  [0,  14, 0,  2],
  "sweet potato":           [2,  20, 0,  3],
  "potato":                 [2,  17, 0,  2],
  "masoor dal dry":         [24, 59, 1,  15],
  "masoor dal cooked":      [9,  20, 0,  8],
  "moong dal cooked":       [7,  18, 0,  8],
  "rajma cooked":           [9,  22, 0,  7],
  "chana dal cooked":       [9,  27, 3,  8],
  "chickpeas cooked":       [9,  27, 3,  8],
  "peanut butter":          [25, 20, 50, 6],
  "almond butter":          [21, 22, 51, 4],
  "ghee":                   [0,  0,  100,0],
  "olive oil":              [0,  0,  100,0],
  "almonds":                [21, 22, 49, 13],
  "peanuts":                [26, 16, 49, 9],
  "milk whole":             [3,  5,  4,  0],
  "milk low fat":           [4,  5,  2,  0],
  "milk toned":             [3,  5,  3,  0],
  "mixed vegetables":       [2,  8,  0,  3],
  "broccoli":               [3,  7,  0,  3],
  "spinach":                [3,  4,  0,  2],
  "cucumber":               [1,  4,  0,  1],
};

// 🟢 FIX 2: Upgraded regex parser that understands "Eggs", "Whites", and "Roti"
function lookupMacros(foodName: string, quantityStr: string): { protein_g: number; carbs_g: number; fat_g: number; fiber_g: number; kcal: number } | null {
  const key = foodName.toLowerCase().replace(/\(.*?\)/g, "").trim();
  const entry = FOOD_DB[key] ?? Object.entries(FOOD_DB).find(([k]) => key.includes(k) || k.includes(key))?.[1];
  if (!entry) return null;
  
  const match = quantityStr.match(/([\d.]+)\s*([a-zA-Z]+)?/i);
  if (!match) return null;
  
  const amount = parseFloat(match[1]);
  const unit   = (match[2] || "").toLowerCase().trim();
  
  let grams = amount;
  if (unit === "kg" || unit === "l" || unit === "liters") {
    grams = amount * 1000;
  } else if (unit.includes("egg") || (key.includes("egg") && !unit.includes("g"))) {
    grams = amount * 50; // 1 whole egg ~ 50g
  } else if (unit.includes("white") || (key.includes("white") && !unit.includes("g"))) {
    grams = amount * 33; // 1 egg white ~ 33g
  } else if (unit.includes("roti") || unit.includes("chapati") || ((key.includes("roti") || key.includes("chapati")) && !unit.includes("g"))) {
    grams = amount * 40; // 1 roti ~ 40g
  } else if (unit.includes("ml")) {
    grams = amount;
  } else if (!unit.includes("g")) {
    // Catch-all for pieces of fruit/veg without a specific unit
    if (key.includes("apple") || key.includes("banana") || key.includes("potato")) grams = amount * 100;
  }
  
  const factor = grams / 100;
  const [p, c, f, fib] = entry;
  
  const protein_g = Math.round(p * factor);
  const carbs_g   = Math.round(c * factor);
  const fat_g     = Math.round(f * factor);
  const fiber_g   = Math.round(fib * factor);
  const kcal      = Math.round(protein_g * 4 + carbs_g * 4 + fat_g * 9);
  
  return { protein_g, carbs_g, fat_g, fiber_g, kcal };
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

// ─────────────────────────────────────────────
// DIET VALIDATOR & AUTO-SCALER
// ─────────────────────────────────────────────
function validateAndScaleMacros(plan: any, macros: MacroTargets): any {
  const weeklyMeals = ensureArray(plan.weekly_meals);
  if (weeklyMeals.length === 0) return plan;

  const fixed = weeklyMeals.map((day: any) => {
    const meals = ensureArray(day.meals);
    const recomputedMeals = meals.map((meal: any) => {
      const foodsRaw = ensureArray(meal.foods || meal.ingredients || meal.items);
      const foods = foodsRaw.map((food: any) => {
        const name     = String(food.name || "Food");
        const quantity = String(food.quantity || "100g");
        
        const fromDB = lookupMacros(name, quantity);
        if (fromDB) return { name, quantity, ...fromDB };

        const p   = Math.round(safeNum(food.protein_g ?? food.protein));
        const c   = Math.round(safeNum(food.carbs_g   ?? food.carbs));
        const f   = Math.round(safeNum(food.fat_g     ?? food.fat));
        const fib = Math.round(safeNum(food.fiber_g   ?? food.fiber));
        return { name, quantity, protein_g: p, carbs_g: c, fat_g: f, fiber_g: fib, kcal: p*4 + c*4 + f*9 };
      });

      const mP   = foods.reduce((s: number, f: any) => s + f.protein_g, 0);
      const mC   = foods.reduce((s: number, f: any) => s + f.carbs_g,   0);
      const mF   = foods.reduce((s: number, f: any) => s + f.fat_g,     0);
      const mFib = foods.reduce((s: number, f: any) => s + f.fiber_g,   0);
      return { ...meal, foods, protein_g: mP, carbs_g: mC, fat_g: mF, fiber_g: mFib, kcal: mP*4 + mC*4 + mF*9 };
    });

    const dayP = recomputedMeals.reduce((s: number, m: any) => s + m.protein_g, 0);
    const dayC = recomputedMeals.reduce((s: number, m: any) => s + m.carbs_g,   0);
    const dayF = recomputedMeals.reduce((s: number, m: any) => s + m.fat_g,     0);

    if (dayP === 0 && dayC === 0 && dayF === 0) return { ...day, meals: recomputedMeals };

    const ratioP = macros.protein_g / Math.max(dayP, 1);
    const ratioC = macros.carbs_g   / Math.max(dayC, 1);
    const ratioF = macros.fat_g     / Math.max(dayF, 1);
    
    const scale = (ratioP + ratioC + ratioF) / 3;
    const shouldScale = Math.abs(scale - 1) > 0.10;

    const scaledMeals = recomputedMeals.map((meal: any) => {
      const scaledFoods = meal.foods.map((food: any) => {
        if (!shouldScale) return food;
        const newQty = food.quantity.replace(/([\d.]+)/, (match: string) => Math.round(parseFloat(match) * scale).toString());
        
        const fromDB = lookupMacros(food.name, newQty);
        if (fromDB) return { ...food, quantity: newQty, ...fromDB };

        const p   = Math.round(food.protein_g * ratioP);
        const c   = Math.round(food.carbs_g   * ratioC);
        const f   = Math.round(food.fat_g     * ratioF);
        const fib = Math.round(food.fiber_g   * ratioC);
        return { ...food, quantity: newQty, protein_g: p, carbs_g: c, fat_g: f, fiber_g: fib, kcal: p*4+c*4+f*9 };
      });

      const mP   = scaledFoods.reduce((s: number, f: any) => s + f.protein_g, 0);
      const mC   = scaledFoods.reduce((s: number, f: any) => s + f.carbs_g,   0);
      const mF   = scaledFoods.reduce((s: number, f: any) => s + f.fat_g,     0);
      const mFib = scaledFoods.reduce((s: number, f: any) => s + f.fiber_g,   0);
      return { ...meal, foods: scaledFoods, protein_g: mP, carbs_g: mC, fat_g: mF, fiber_g: mFib, kcal: mP*4+mC*4+mF*9 };
    });

    const newDayP = scaledMeals.reduce((s: number, m: any) => s + m.protein_g, 0);
    const newDayC = scaledMeals.reduce((s: number, m: any) => s + m.carbs_g,   0);
    const newDayF = scaledMeals.reduce((s: number, m: any) => s + m.fat_g,     0);

    return { ...day, meals: scaledMeals, total_protein_g: newDayP, total_carbs_g: newDayC, total_fat_g: newDayF, total_kcal: newDayP*4 + newDayC*4 + newDayF*9 };
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

// ─────────────────────────────────────────────
// 🟢 FIX 1: ENHANCED FALLBACK DIET PLAN (Eggetarian Handled Properly + 7 Full Days)
// ─────────────────────────────────────────────
function getFallbackDietPlan(macros: MacroTargets, timing: TimingConfig, profile: Record<string, unknown>): any {
  const dp = String(profile.dietary_pattern || "eggetarian").toLowerCase();
  const isVegan = dp === "vegan"; 
  const isVeg = dp === "vegetarian";
  const isEggetarian = dp === "eggetarian";

  // Isolate proteins correctly to stop Fish from entering an Eggetarian plan
  const proteins = isVegan 
    ? ["Tofu", "Soya chunks dry", "Masoor dal dry", "Chickpeas cooked"] 
    : isVeg 
    ? ["Paneer", "Low fat curd", "Soya chunks dry", "Greek yogurt"] 
    : isEggetarian
    ? ["Boiled eggs", "Egg whites", "Paneer", "Greek yogurt", "Soya chunks dry"]
    : ["Chicken breast", "Boiled eggs", "Fish", "Egg whites", "Paneer"];
  
  const carbs = ["Oats", "White rice dry", "Roti", "Poha", "Brown rice dry", "Sweet potato", "Banana"];
  const veggies = ["Mixed vegetables", "Spinach", "Broccoli", "Cucumber"];

  const buildMeal = (mealName: string, time: string, frac: number, dIdx: number, mIdx: number) => {
    const pName = proteins[(dIdx + mIdx) % proteins.length];
    const cName = carbs[(dIdx * 2 + mIdx) % carbs.length];
    const vName = veggies[(dIdx + mIdx * 2) % veggies.length];

    let pQty = "100g";
    if (pName.toLowerCase().includes("egg")) pQty = "3 eggs";
    if (pName.toLowerCase().includes("white")) pQty = "6 whites";
    if (pName.toLowerCase().includes("whey")) pQty = "30g";

    let cQty = "60g";
    if (cName === "Roti") cQty = "2 roti";
    if (cName === "Banana") cQty = "150g";

    return {
      time, name: mealName, kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, prep_time_min: 10,
      foods: [
        { name: pName, quantity: pQty, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, kcal: 0 },
        { name: cName, quantity: cQty, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, kcal: 0 },
        { name: vName, quantity: "100g", protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, kcal: 0 }
      ],
      tip: "Weigh dry grains. Adjust spices as needed."
    };
  };

  // Generate ALL 7 days immediately so they never duplicate
  const daysArray = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  
  const weekly_meals = daysArray.map((day, dIdx) => ({
    day, day_name: day, type: "standard", 
    total_kcal: macros.calories, total_protein_g: macros.protein_g, total_carbs_g: macros.carbs_g, total_fat_g: macros.fat_g, 
    hydration_reminder: "3.5L water today. 500ml on waking.", daily_note: "Focus on your goals and track your meals.",
    meals: timing.names.map((name, i) => buildMeal(name, timing.times[i], timing.kcalSplit[i], dIdx, i))
  }));

  return {
    weekly_rules: { protein_strategy: `Hit ${macros.protein_g}g daily.`, refeed_day: "Saturday refeed.", steps_target: "10,000 steps.", sleep_protocol: "7.5-8 hours.", water_target: "3.5 Liters." },
    weekly_meals
  };
}

function getFallbackWorkout() {
  return {
    workout_plan: {
      frequency: "5 sessions per week", philosophy: "Push-Pull-Legs maximizes compound stimulus.", weekly_schedule_summary: ["Mon: Push", "Tue: Pull", "Wed: Rest", "Thu: Legs", "Fri: HIIT", "Sat: Full Body", "Sun: Rest"], rest_day_activity: "8,000 steps walk.", progressive_overload_note: "Add 2.5kg to compound lifts.",
      sessions: [
        { day: "Monday", type: "Strength", focus: "Push", duration_min: 50, warm_up: ["Dynamic arm warm-up"], exercises: [{ name: "Dumbbell Bench Press", sets: 4, reps: "8-10", rest_sec: 90, tip: "Scapula retracted." }, { name: "Overhead Press", sets: 3, reps: "10-12", rest_sec: 75, tip: "Core tight." }], cool_down: ["Chest stretch"] },
        { day: "Tuesday", type: "Strength", focus: "Pull", duration_min: 50, warm_up: ["Dead hangs"], exercises: [{ name: "Lat Pulldown", sets: 4, reps: "8-10", rest_sec: 90, tip: "Drive elbows down." }, { name: "Dumbbell Rows", sets: 3, reps: "10-12", rest_sec: 75, tip: "Squeeze lats." }], cool_down: ["Lat stretch"] }
      ]
    },
    lifestyle_rules: { sleep_hours: "7.5–8 hours.", water_liters: "3.5 liters/day.", daily_steps: "10,000 steps daily.", stress_management: ["Breathing rituals before sleep."], avoid_list: ["Liquid calories", "Deep fried foods"], recovery_tips: ["Post workout nutrition within 45m."], supplement_suggestions: ["Whey protein isolate"], habit_tracker: ["Hit targets?"] }
  };
}

// ─────────────────────────────────────────────
// HIGH-Tier PREMIUM PROMPT BUILDERS
// ─────────────────────────────────────────────
function buildDietPrompt(profile: Record<string, unknown>, macros: MacroTargets, timing: TimingConfig, foodType: string, notes: string, days: string[]): string {
  const dp = String(profile.dietary_pattern || "vegetarian").toLowerCase();
  let dietRule = "";
  if (dp === "vegetarian") dietRule = "STRICTLY VEGETARIAN. FATAL EXCEPTION EXCLUSION IF YOU INCLUDE EGGS, MEAT, OR FISH. Use ONLY Paneer, Soya, Dal, Curd, Milk, Whey.";
  else if (dp === "vegan")  dietRule = "STRICTLY VEGAN. ZERO DAIRY, ZERO EGGS, ZERO MEAT. Use Tofu, Soya Chunks, Almonds, Lentils.";
  else if (dp === "eggetarian") dietRule = "EGGETARIAN. Eggs are fully permitted. ZERO MEAT, ZERO CHICKEN, ZERO FISH. Use Eggs, Egg Whites, Paneer, Soya, Dairy.";
  else                          dietRule = "NON-VEGETARIAN permitted. Strategically leverage Chicken Breast, Fish, Eggs along with Paneer and Soya.";

  const mealTargets = timing.kcalSplit.map((frac, i) => {
    return `Meal ${i + 1} (${timing.names[i]}): ${Math.round(macros.calories * frac)} kcal | ${Math.round(macros.protein_g * frac)}g P | ${Math.round(macros.carbs_g * frac)}g C | ${Math.round(macros.fat_g * frac)}g F`;
  }).join("\n");

  return `Execute deep clinical evaluation to structure a ${days.length}-day hyper-precise elite Indian diet plan (${days.join(", ")}).
TARGETS: Exactly ${macros.calories}kcal, ${macros.protein_g}g Protein, ${macros.carbs_g}g Carbs, ${macros.fat_g}g Fat. Goal: ${sanitizeField(profile.primary_goal)}. Food Taxonomy: ${foodType}.
${notes ? `MANDATORY CLIENT ADAPTATIONS: ${notes}` : ""}

CRITICAL REASONING CONSTRAINTS:
1. DIETARY BOUNDARY: ${dietRule}
2. FREQUENCY: Exactly compile ${timing.count} separate meals per day matching these exact split profiles:
   ${mealTargets}
3. COMPUTE TRUTHS: Ensure every single ingredient matches a raw entity from common Indian sports science data. Grains must list dry weights (e.g. "60g dry").
4. ALL NUMERIC FIELDS ("protein_g", "carbs_g", "fat_g", "kcal") MUST BE INTEGER LITERALS, NOT STRINGS.
5. CULINARY VARIETY: This is a premium plan. DO NOT copy-paste meals across days. You MUST rotate primary protein and carb sources. If ${days[0]} has a Paneer dish, ${days[1] || "the next day"} MUST feature Soya, Tofu, Legumes, or a completely different preparation.

OUTPUT JSON FORMAT ONLY:
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
          "kcal": 500, "protein_g": 35, "carbs_g": 40, "fat_g": 12, "fiber_g": 5, "prep_time_min": 15,
          "foods": [{ "name": "Paneer", "quantity": "100g", "protein_g": 18, "carbs_g": 3, "fat_g": 14, "fiber_g": 0, "kcal": 210 }],
          "tip": "..."
        }
      ]
    }
  ]
}`;
}

function buildWorkoutPrompt(profile: Record<string, unknown>, macros: MacroTargets): string {
  const goal = sanitizeField(profile.primary_goal);
  const stress = parseInt(String(profile.stress_level || "5"));
  const sleep = parseFloat(String(profile.sleep_hours || "7.5"));
  
  return `Act as a world-class Tier-1 Strength Coach and Bio-Architectural Adaptation Expert. Construct a highly personalized, elite 5-day training program and neurological recovery schema.
CLIENT PROFILE: Goal: ${goal} | Calculated Intake: ${macros.calories} kcal | Sleep Status: ${sleep} hours | Neurological Stress Baseline: ${stress}/10.

INSTRUCTIONS:
1. CUSTOM SPLIT EVOLUTION: Build a periodized routine optimal for ${goal}. For fat_loss/recomp, emphasize compound load density to safeguard lean mass. For muscle_gain, optimize hyper-trophy volume splits.
2. STRESS INTERCEPTION: Adjust overall system volume based on stress level (${stress}/10). If stress is high (>=7), include advanced nervous system recovery protocols.
3. OUTPUT FORMAT: Respond ONLY with a clean JSON object containing keys "workout_plan" and "lifestyle_rules".

SCHEMA BLUEPRINT:
{
  "workout_plan": {
    "frequency": "5 sessions per week",
    "philosophy": "Detailed physiological rationale engineered for this client...",
    "weekly_schedule_summary": ["Day 1: ...", "Day 2: ..."],
    "rest_day_activity": "Active recovery protocol...",
    "progressive_overload_note": "Specific metrics to track for linear or block progression...",
    "sessions": [
      {
        "day": "Monday", "type": "Strength", "focus": "Push (Chest/Shoulders/Triceps)", "duration_min": 50,
        "warm_up": ["Specific mobility drill 1", "Specific dynamic activation 2"],
        "exercises": [
          { "name": "Incline Dumbbell Press", "sets": 4, "reps": "8-10", "rest_sec: 90, "tip": "Control eccentrics; drive straight up." }
        ],
        "cool_down": ["Targeted fascial stretch"]
      }
    ]
  },
  "lifestyle_rules": {
    "sleep_hours": "Exact target based on data...",
    "water_liters": "3.5 Liters daily minimum...",
    "daily_steps": "8,000-10,000 steps...",
    "stress_management": ["Actionable bio-feedback habit 1", "Actionable behavior 2"],
    "avoid_list": ["Specific inflammatory substances or behaviors..."],
    "recovery_tips": ["Post-workout amino/protein window timing...", "CNS down-regulation method..."],
    "supplement_suggestions": ["Whey Protein Isolate - 1 scoop post-training", "Creatine Monohydrate - 3g daily"],
    "habit_tracker": ["Metric 1", "Metric 2"]
  }
}`;
}

// ─────────────────────────────────────────────
// MAIN ENGINE HANDLER
// ─────────────────────────────────────────────
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
    const timing     = getMealTimingConfig(timingPref);
    const macros     = calcMacros(profile);
    const foodType   = String(body.food_type || profile.food_type || "indian");
    const notes      = String(body.notes || "").slice(0, 500);

    const apiKey = Deno.env.get("DEEPSEEK_API_KEY");
    if (!apiKey) {
      console.error(`[${userId}] DEEPSEEK_API_KEY missing! Forcing local fallback.`);
    }

    const systemPrompt = "You are a world-class Master Sports Dietitian and Elite Tier-1 Strength Coach specializing in bio-architectural transformation for Indian athletes. Analyze all variables step-by-step to produce hyper-optimized, mathematically flawless elite protocols. Return ONLY a single, valid, perfectly formatted JSON object matching the requested schema exactly, with zero conversational prose.";

    // 🟢 FIX 3: Make the AI generate 7 full days directly in two chunks (4 days + 3 days)
    const [diet1Result, diet2Result, workoutResult] = await Promise.allSettled([
      apiKey ? fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: "deepseek-chat", messages: [{ role: "system", content: systemPrompt }, { role: "user", content: buildDietPrompt(profile, macros, timing, foodType, notes, ["Monday", "Tuesday", "Wednesday", "Thursday"]) }], temperature: 0.65, max_tokens: 4000, response_format: { type: "json_object" } }),
        signal: AbortSignal.timeout(55_000)
      }).then(res => res.json()).then(d => d.choices?.[0]?.message?.content || null) : Promise.resolve(null),
      
      apiKey ? fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: "deepseek-chat", messages: [{ role: "system", content: systemPrompt }, { role: "user", content: buildDietPrompt(profile, macros, timing, foodType, notes, ["Friday", "Saturday", "Sunday"]) }], temperature: 0.65, max_tokens: 3000, response_format: { type: "json_object" } }),
        signal: AbortSignal.timeout(55_000)
      }).then(res => res.json()).then(d => d.choices?.[0]?.message?.content || null) : Promise.resolve(null),

      apiKey ? fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: "deepseek-chat", messages: [{ role: "system", content: systemPrompt }, { role: "user", content: buildWorkoutPrompt(profile, macros) }], temperature: 0.30, max_tokens: 3000, response_format: { type: "json_object" } }),
        signal: AbortSignal.timeout(55_000)
      }).then(res => res.json()).then(d => d.choices?.[0]?.message?.content || null) : Promise.resolve(null)
    ]);

    const d1 = diet1Result.status === "fulfilled" ? safeParseJSON(diet1Result.value ?? "") : null;
    const d2 = diet2Result.status === "fulfilled" ? safeParseJSON(diet2Result.value ?? "") : null;

    let dietRaw: any;
    if (d1?.weekly_meals && d2?.weekly_meals) {
      dietRaw = { ...d1, weekly_meals: [...ensureArray(d1.weekly_meals), ...ensureArray(d2.weekly_meals)] };
    } else {
      console.warn(`[${userId}] One or both diet chunks failed. Injecting hyper-varied mathematical fallback.`);
      dietRaw = getFallbackDietPlan(macros, timing, profile);
    }

    // Because the AI (or fallback) now outputs 7 distinct days natively, we no longer need expandToSevenDays!
    dietRaw = validateAndScaleMacros(dietRaw, macros);

    let workoutData = workoutResult.status === "fulfilled" ? safeParseJSON(workoutResult.value ?? "") : null;
    const hasValidSessions = Array.isArray(workoutData?.workout_plan?.sessions) && workoutData.workout_plan.sessions.length >= 2;
    const hasValidRules    = Array.isArray(workoutData?.lifestyle_rules?.avoid_list) && workoutData.lifestyle_rules.avoid_list.length > 0;

    if (!workoutData || !workoutData.workout_plan || !hasValidSessions || !hasValidRules) {
      console.warn(`[${userId}] Workout AI empty/invalid. Injecting detailed fallback.`);
      workoutData = getFallbackWorkout();
    }

    const { count } = await supabaseAdmin.from("meal_plans").select("*", { count: "exact", head: true }).eq("user_id", userId);
    const generatedWeekNumber = (count || 0) + 1;

    const fullPlan = { ...dietRaw, plan_week: generatedWeekNumber, workout_plan: workoutData.workout_plan, lifestyle_rules: workoutData.lifestyle_rules || dietRaw.weekly_rules, daily_macros: macros };

    await supabaseAdmin.from("meal_plans").upsert({ user_id: userId, plan_week: generatedWeekNumber, plan_json: fullPlan, food_type: foodType, meal_count: timing.count, generated_at: new Date().toISOString() }, { onConflict: "user_id,plan_week" });
    await supabaseAdmin.from("users").update({ onboarding_completed: true }).eq("id", userId);

    return new Response(JSON.stringify({ success: true, plan: fullPlan }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});