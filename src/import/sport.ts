import type { NormalizedSport } from "./types.js";

/**
 * Map a source-specific activity label ("HKWorkoutActivityTypeRunning", "TrailRun",
 * "strength_training", "Krafttraining", ...) to a normalized sport. The activity name is
 * checked first, because Hyrox sessions and SkiErg work are usually logged under a generic
 * type ("Cardio", "Workout") and only the title says what they were.
 */
export function normalizeSport(label: string | undefined, name?: string): NormalizedSport {
  const title = (name ?? "").toLowerCase();
  if (/hyrox/.test(title)) return "hyrox";
  if (/ski\s?-?erg/.test(title)) return "skierg";

  const l = (label ?? "")
    .replace(/^HKWorkoutActivityType/, "")
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  if (!l) return "other";
  if (/hyrox/.test(l)) return "hyrox";
  if (/ski_?erg/.test(l)) return "skierg";
  if (/row|ruder/.test(l)) return "row";
  if (/swim|schwimm/.test(l)) return "swim";
  if (/hik|wander/.test(l)) return "hike";
  if (/walk|gehen|spazier/.test(l)) return "walk";
  if (/run|jog|lauf|treadmill/.test(l)) return "run";
  if (/cycl|bik|ride|spinning|radfahren|(^|_)rad(_|$)/.test(l)) return "bike";
  if (
    /hiit|high_intensity|cross_?fit|cross_training|functional|boot_camp|circuit|mixed_cardio|calisthenics|interval_training/.test(
      l
    )
  )
    return /functional_strength/.test(l) ? "strength" : "hiit";
  if (/strength|weight|kraft|lifting|core_training/.test(l)) return "strength";
  return "other";
}
