export type GoalType = "cut" | "bulk";

export type NutritionGoals = {
  goalType: GoalType;
  calorieGoal: number;
  proteinGoal: number;
};

const round1 = (value: number) => Math.round(value * 10) / 10;
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export const computeCalorieScore = (
  consumed: number,
  goal: number,
  goalType: GoalType,
): number => {
  if (!goal || goal <= 0 || !Number.isFinite(consumed)) return 0;
  const pct = consumed / goal;

  if (goalType === "cut") {
    if (pct >= 0.8 && pct <= 1.0) return 10;
    if (pct > 1.0 && pct <= 1.3) return round1(clamp(10 * (1.3 - pct) / 0.3, 0, 10));
    if (pct < 0.8 && pct >= 0.5) return round1(clamp(10 * (pct - 0.5) / 0.3, 0, 10));
    return 0;
  }

  if (pct >= 1.0 && pct <= 1.2) return 10;
  if (pct < 1.0 && pct >= 0.7) return round1(clamp(10 * (pct - 0.7) / 0.3, 0, 10));
  if (pct > 1.2 && pct <= 1.5) return round1(clamp(10 * (1.5 - pct) / 0.3, 0, 10));
  return 0;
};

export const computeProteinScore = (consumed: number, goal: number): number => {
  if (!goal || goal <= 0 || !Number.isFinite(consumed)) return 0;
  const pct = consumed / goal;
  if (pct >= 1.0) return 10;
  if (pct <= 0) return 0;
  return round1(clamp(10 * pct, 0, 10));
};

export const hasNutritionGoals = (
  goals: Partial<NutritionGoals> | null | undefined,
): goals is NutritionGoals =>
  !!goals &&
  (goals.goalType === "cut" || goals.goalType === "bulk") &&
  typeof goals.calorieGoal === "number" &&
  goals.calorieGoal > 0 &&
  typeof goals.proteinGoal === "number" &&
  goals.proteinGoal > 0;
