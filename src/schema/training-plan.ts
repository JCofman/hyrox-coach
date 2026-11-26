/**
 * Hyrox Training Plan JSON Schema
 *
 * Describes a periodized Hyrox preparation plan. Detailed enough to export to:
 * - Calendar (.ics)
 * - Garmin Connect (.fit workouts)
 * - Zwift (.zwo, run and bike sessions)
 */

// ============================================================================
// Core Types
// ============================================================================

/**
 * Session categories:
 * - run:      pure running (easy, tempo, intervals, long)
 * - erg:      SkiErg / rower sessions
 * - stations: Hyrox station work (sleds, burpee broad jumps, carries, lunges, wall balls)
 * - strength: gym strength (max strength, strength endurance, accessories)
 * - hyrox:    compromised running, partial and full race simulations
 * - bike:     low-impact cross-training
 */
export type Sport = "run" | "erg" | "stations" | "strength" | "hyrox" | "bike" | "race" | "rest";

export type HyroxStation =
  | "skierg"
  | "sled_push"
  | "sled_pull"
  | "burpee_broad_jump"
  | "row"
  | "farmers_carry"
  | "sandbag_lunges"
  | "wall_balls";

export type HyroxDivision =
  | "open_women"
  | "open_men"
  | "pro_women"
  | "pro_men"
  | "doubles_women"
  | "doubles_men"
  | "doubles_mixed"
  | "relay";

export type WorkoutType =
  | "rest"
  | "recovery"
  | "endurance"
  | "tempo"
  | "threshold"
  | "intervals"
  | "vo2max"
  | "sprint"
  | "race"
  | "compromised"
  | "simulation"
  | "strength_endurance"
  | "max_strength"
  | "technique"
  | "test"
  | "hills"
  | "long";

export type IntensityUnit =
  | "percent_ftp"
  | "percent_lthr"
  | "hr_zone"
  | "pace_zone"
  | "rpe"
  | "split_offset"; // seconds per 500m relative to threshold erg split

export type DurationUnit =
  | "seconds"
  | "minutes"
  | "hours"
  | "meters"
  | "kilometers"
  | "miles"
  | "yards"
  | "laps";

export type StepType = "warmup" | "work" | "recovery" | "rest" | "cooldown" | "interval_set";

// Unit system preferences
export type LandDistanceUnit = "kilometers" | "miles";
export type FirstDayOfWeek = "monday" | "sunday";

export interface UnitPreferences {
  bike: LandDistanceUnit;
  run: LandDistanceUnit;
  weight?: "kg" | "lb";
  firstDayOfWeek: FirstDayOfWeek;
}

// Default preferences (metric)
export const defaultPreferences: UnitPreferences = {
  bike: "kilometers",
  run: "kilometers",
  firstDayOfWeek: "monday",
};

// ============================================================================
// Workout Structure (for Zwift/Garmin export)
// ============================================================================

export interface IntensityTarget {
  unit: IntensityUnit;
  value: number; // e.g., 75 for 75% FTP, or 3 for Zone 3
  valueLow?: number; // For ranges: 70-75% FTP
  valueHigh?: number;
  description?: string; // "Zone 2", "Threshold", "Easy"
}

export interface DurationTarget {
  unit: DurationUnit;
  value: number;
}

export interface WorkoutStep {
  type: StepType;
  name?: string;
  duration: DurationTarget;
  intensity: IntensityTarget;
  cadence?: { low: number; high: number }; // RPM for bike, SPM for run
  notes?: string;
}

export interface IntervalSet {
  type: "interval_set";
  name?: string;
  repeats: number;
  steps: WorkoutStep[]; // Usually [work, recovery]
}

export interface StructuredWorkout {
  warmup?: WorkoutStep[];
  main: (WorkoutStep | IntervalSet)[];
  cooldown?: WorkoutStep[];
  totalDuration?: DurationTarget; // Calculated or specified
  estimatedTSS?: number;
  estimatedIF?: number; // Intensity Factor
}

// ============================================================================
// Daily Workout
// ============================================================================

export interface Workout {
  id: string;
  sport: Sport;
  type: WorkoutType;
  name: string;
  description: string;

  // Duration of the whole session, warm-up and cool-down included. The viewer's
  // calendar cards and hour totals read this, so the parts of `humanReadable`
  // (and the steps of `structure`, when present) must add up to it.
  durationMinutes?: number;
  distanceMeters?: number;

  // Intensity summary
  primaryZone?: string; // "Zone 2", "Threshold", etc.
  targetHR?: { low: number; high: number };
  targetPower?: { low: number; high: number }; // Watts or % FTP
  targetPace?: { low: string; high: string }; // "5:30/km" - "5:45/km"
  rpe?: number; // 1-10

  // Hyrox stations trained in this session (shown as tags in the viewer)
  stations?: HyroxStation[];

  // Structured workout for device export
  structure?: StructuredWorkout;

  // Human-readable workout text (for display)
  humanReadable?: string;

  // Tracking
  completed: boolean;
  completedAt?: string; // ISO date
  actualDuration?: number;
  actualDistance?: number;
  notes?: string;
}

// ============================================================================
// Training Week
// ============================================================================

export interface TrainingDay {
  date: string; // ISO date: "2025-01-06"
  dayOfWeek: string; // "Monday"
  workouts: Workout[]; // Can have multiple (e.g., AM swim + PM run)
}

export interface WeekSummary {
  totalHours: number;
  totalTSS?: number;
  bySport: {
    [key in Sport]?: {
      sessions: number;
      hours: number;
      km?: number;
    };
  };
}

export interface TrainingWeek {
  weekNumber: number;
  startDate: string; // ISO date
  endDate: string;
  phase: string;
  focus: string;
  targetHours: number;
  days: TrainingDay[];
  summary: WeekSummary;
  isRecoveryWeek: boolean;
}

// ============================================================================
// Training Zones
// ============================================================================

export interface HeartRateZones {
  lthr: number; // Lactate threshold HR
  zones: {
    zone: number;
    name: string;
    percentLow: number;
    percentHigh: number;
    hrLow: number;
    hrHigh: number;
  }[];
}

export interface PowerZones {
  ftp: number; // Functional Threshold Power
  zones: {
    zone: number;
    name: string;
    percentLow: number;
    percentHigh: number;
    wattsLow: number;
    wattsHigh: number;
  }[];
}

export interface ErgZones {
  thresholdSplit: string; // Threshold split per 500m: "1:55/500m" (roughly 2k pace + 8-10s)
  thresholdSplitSeconds: number; // Per 500m
  zones: {
    zone: number;
    name: string;
    paceOffset: number; // Seconds per 500m relative to threshold split
    pace: string; // "2:05/500m"
  }[];
}

export interface PaceZones {
  thresholdPace: string; // "4:30/km"
  thresholdPaceSeconds: number; // Per km
  zones: {
    zone: string; // "E", "M", "T", "I", "R"
    name: string;
    pace: string;
    paceSeconds: number;
  }[];
}

export interface AthleteZones {
  run?: {
    hr?: HeartRateZones;
    pace?: PaceZones;
  };
  bike?: {
    hr?: HeartRateZones;
    power?: PowerZones;
  };
  row?: ErgZones;
  ski?: ErgZones;
  maxHR?: number;
  restingHR?: number;
  weight?: number; // kg
}

// ============================================================================
// Athlete Assessment
// ============================================================================

export interface AthleteAssessment {
  foundation: {
    raceHistory: string[];
    peakTrainingLoad: number; // hours/week
    foundationLevel: "beginner" | "intermediate" | "advanced" | "elite";
    yearsInSport: number;
  };
  currentForm: {
    weeklyVolume: {
      total: number; // hours/week
      run?: number;
      strength?: number;
      erg?: number;
      other?: number;
    };
    weeklyRunKm?: number;
    longestSessions: {
      run?: number; // km
    };
    consistency: number; // sessions/week
    timeSincePeakFitness?: string;
    reasonForTimeOff?: string;
  };
  // "area" is a Sport or a HyroxStation, e.g. "run", "sled_push", "wall_balls"
  strengths: {
    area: string;
    evidence: string;
  }[];
  limiters: {
    area: string;
    evidence: string;
  }[];
  // Where the activity history came from, e.g. ["apple_health", "garmin"]
  dataSources?: string[];
  constraints: string[];
}

// ============================================================================
// Training Phases
// ============================================================================

export interface TrainingPhase {
  name: string;
  startWeek: number;
  endWeek: number;
  focus: string;
  weeklyHoursRange: { low: number; high: number };
  keyWorkouts: string[];
  physiologicalGoals: string[];
}

// ============================================================================
// Race Strategy
// ============================================================================

export interface StationPlan {
  station: HyroxStation;
  order: number; // 1-8
  load: string; // "1000 m", "152 kg x 50 m", "100 reps @ 6 kg"
  targetTime: string; // "4:30"
  strategy: string; // pacing, breaks, technique cues
}

export interface RaceStrategy {
  event: {
    name: string;
    date: string;
    division: HyroxDivision;
    goalTime?: string; // "1:25:00"
  };
  pacing: {
    run: { targetPace: string; targetHR?: string; notes: string };
    // Target total time in the Roxzone (transitions)
    roxzone?: { targetTime: string; notes: string };
    stations: StationPlan[];
  };
  nutrition: {
    preRace: string;
    during: string;
    notes: string;
  };
  taper: {
    startDate: string;
    volumeReduction: number; // percent
    notes: string;
  };
  raceDay: {
    wakeUpTime?: string;
    preRaceMeal?: string;
    warmUp?: string;
    mentalCues?: string[];
  };
}

// ============================================================================
// Complete Training Plan
// ============================================================================

export interface TrainingPlan {
  version: "1.0";
  meta: {
    id: string;
    athlete: string;
    event: string;
    eventDate: string;
    division?: HyroxDivision;
    goalTime?: string;
    planStartDate: string;
    planEndDate: string;
    createdAt: string;
    updatedAt: string;
    totalWeeks: number;
    generatedBy: string; // "Hyrox Coach"
  };
  preferences: UnitPreferences;
  assessment: AthleteAssessment;
  zones: AthleteZones;
  phases: TrainingPhase[];
  weeks: TrainingWeek[];
  raceStrategy: RaceStrategy;
}

// ============================================================================
// Example/Template
// ============================================================================

export const exampleWorkout: Workout = {
  id: "week5-sat-hyrox",
  sport: "hyrox",
  type: "compromised",
  name: "Compromised Run: Sleds + Wall Balls",
  description: "Practice running at race pace on heavy legs straight off the sleds",
  durationMinutes: 60,
  distanceMeters: 4000,
  primaryZone: "Zone 4",
  rpe: 8,
  stations: ["sled_push", "sled_pull", "wall_balls"],
  structure: {
    warmup: [
      {
        type: "warmup",
        name: "Easy jog + mobility",
        duration: { unit: "minutes", value: 12 },
        intensity: { unit: "rpe", value: 3, description: "Easy" },
      },
    ],
    main: [
      {
        type: "interval_set",
        name: "Run + station",
        repeats: 4,
        steps: [
          {
            type: "work",
            name: "Run 1 km",
            duration: { unit: "kilometers", value: 1 },
            intensity: { unit: "rpe", value: 7, description: "Hyrox race pace" },
          },
          {
            type: "work",
            name: "Station",
            duration: { unit: "minutes", value: 4 },
            intensity: { unit: "rpe", value: 8 },
            notes: "Alternate: sled push 50 m / sled pull 50 m / 40 wall balls / sled push 50 m",
          },
        ],
      },
    ],
    cooldown: [
      {
        type: "cooldown",
        name: "Walk + stretch",
        duration: { unit: "minutes", value: 10 },
        intensity: { unit: "rpe", value: 2 },
      },
    ],
    totalDuration: { unit: "minutes", value: 60 },
  },
  humanReadable: `Warm-up: 12 min easy jog + mobility
Main: 4 rounds, no rest between run and station (~38 min)
  1 km run @ race pace
  Round 1: sled push 50 m | Round 2: sled pull 50 m
  Round 3: 40 wall balls  | Round 4: sled push 50 m
Cool-down: 10 min walk + stretch`,
  completed: false,
};
