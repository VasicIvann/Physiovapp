export type DailyLogEntry = {
  date: string;
  weight?: number;
  skinCare?: "done" | "not done";
  shower?: "done" | "not done";
  supplement?: "done" | "not done";
  sleepTime?: string;
  exercises?: string[];
};

export type PointsSummary = {
  totalPoints: number;
  dailyPoints: number;
  weeklyPoints: number;
  lastComputedAt: string;
  rank: string;
};

export const parseSleepToHours = (value?: string) => {
  if (!value || !value.includes(":")) return null;
  const [h, m] = value.split(":").map((n) => Number(n));
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h + m / 60;
};

const startOfWeekKey = (dateStr: string) => {
  const d = new Date(dateStr);
  const day = d.getDay(); // 0 = Sunday
  const diff = (day + 6) % 7; // number of days since Monday
  d.setDate(d.getDate() - diff);
  return d.toISOString().slice(0, 10);
};

export const computeDailyPoints = (log: DailyLogEntry) => {
  let points = 0;

  // Weight
  points += typeof log.weight === "number" ? 1 : -1;

  // Shower
  points += log.shower === "done" ? 1 : -1;

  // Sleep
  const sleepHours = parseSleepToHours(log.sleepTime);
  if (sleepHours !== null) {
    if (sleepHours >= 8.5) points += 2;
    else if (sleepHours >= 7.5) points += 1;
    else if (sleepHours < 6) points -= 2;
    else if (sleepHours < 7) points -= 1;
  }
  else points -= 1;

  return points;
};

const computeWeeklyPoints = (logs: DailyLogEntry[]) => {
  const byWeek = new Map<
    string,
    { skinCareDone: number; supplementDone: number; exercisesCount: number }
  >();

  logs.forEach((log) => {
    const weekKey = startOfWeekKey(log.date);
    const entry = byWeek.get(weekKey) ?? { skinCareDone: 0, supplementDone: 0, exercisesCount: 0 };
    if (log.skinCare === "done") entry.skinCareDone += 1;
    if (log.supplement === "done") entry.supplementDone += 1;
    entry.exercisesCount += Array.isArray(log.exercises) ? log.exercises.length : 0;
    byWeek.set(weekKey, entry);
  });

  let weeklyPoints = 0;
  byWeek.forEach((week) => {
    // Skin care
    if (week.skinCareDone >= 7) weeklyPoints += 7;
    else if (week.skinCareDone >= 4) weeklyPoints += 4;
    else if (week.skinCareDone <= 0) weeklyPoints -= 6;
    else if (week.skinCareDone <= 2) weeklyPoints -= 3;

    // Supplement
    if (week.supplementDone >= 5) weeklyPoints += 4;
    else if (week.supplementDone <= 2) weeklyPoints -= 4;

    // Exercises
    if (week.exercisesCount >= 6) weeklyPoints += 6;
    else if (week.exercisesCount >= 4) weeklyPoints += 3;
    else if (week.exercisesCount <= 1) weeklyPoints -= 6;
    else if (week.exercisesCount <= 3) weeklyPoints -= 3;
  });

  return weeklyPoints;
};

export const computePointsFromLogs = (logs: DailyLogEntry[]): PointsSummary => {
  const dailyPoints = logs.reduce((sum, log) => sum + computeDailyPoints(log), 0);
  const weeklyPoints = computeWeeklyPoints(logs);
  const totalPoints = dailyPoints + weeklyPoints;

  let rank = "iron";
  if (totalPoints <= 0) rank = "iron";
  else if (totalPoints <= 20) rank = "bronze";
  else if (totalPoints <= 50) rank = "silver";
  else if (totalPoints <= 100) rank = "gold";
  else if (totalPoints <= 175) rank = "plat";
  else if (totalPoints <= 250) rank = "diam";
  else if (totalPoints <= 350) rank = "asc";
  else if (totalPoints <= 400) rank = "imo";
  else rank = "rad";

  return {
    totalPoints,
    dailyPoints,
    weeklyPoints,
    lastComputedAt: new Date().toISOString(),
    rank,
  };
};
