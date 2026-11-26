import { describe, it, expect } from "vitest";
import { Readable } from "stream";
import { parseAppleHealthExport, parseAppleDate } from "../../src/import/apple-health.js";
import { parseFit, parseGpx, parseTcx } from "../../src/import/files.js";
import {
  isGarminActivitiesCsv,
  parseClock,
  parseGarminActivitiesCsv,
  parseGarminSummarizedActivities,
  parseLocaleNumber,
} from "../../src/import/garmin.js";
import {
  isFitbitExerciseLog,
  isGoogleFitSession,
  parseFitbitExerciseLog,
  parseGoogleFitSession,
} from "../../src/import/google.js";
import { normalizeSport } from "../../src/import/sport.js";
import { isSameSession } from "../../src/db/store.js";

describe("normalizeSport", () => {
  it.each([
    ["HKWorkoutActivityTypeRunning", undefined, "run"],
    ["HKWorkoutActivityTypeTraditionalStrengthTraining", undefined, "strength"],
    ["HKWorkoutActivityTypeFunctionalStrengthTraining", undefined, "strength"],
    ["HKWorkoutActivityTypeHighIntensityIntervalTraining", undefined, "hiit"],
    ["HKWorkoutActivityTypeRowing", undefined, "row"],
    ["HKWorkoutActivityTypeCrossTraining", undefined, "hiit"],
    ["TrailRun", undefined, "run"],
    ["WeightTraining", undefined, "strength"],
    ["Crossfit", undefined, "hiit"],
    ["treadmill_running", undefined, "run"],
    ["indoor_rowing", undefined, "row"],
    ["strength_training", undefined, "strength"],
    ["Krafttraining", undefined, "strength"],
    ["Laufen", undefined, "run"],
    ["Workout", "HYROX Sim Saturday", "hyrox"],
    ["Cardio", "SkiErg intervals", "skierg"],
    ["VirtualRide", undefined, "bike"],
    ["Yoga", undefined, "other"],
    [undefined, undefined, "other"],
  ])("%s / %s -> %s", (label, name, expected) => {
    expect(normalizeSport(label, name)).toBe(expected);
  });
});

describe("Apple Health", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<HealthData locale="de_DE">
 <ExportDate value="2026-11-01 10:00:00 +0100"/>
 <Record type="HKQuantityTypeIdentifierHeartRate" sourceName="Watch" unit="count/min" startDate="2026-10-01 07:00:00 +0200" endDate="2026-10-01 07:00:00 +0200" value="140"/>
 <Record type="HKQuantityTypeIdentifierRestingHeartRate" sourceName="Watch" unit="count/min" startDate="2026-10-01 00:00:00 +0200" endDate="2026-10-01 23:00:00 +0200" value="50"/>
 <Record type="HKQuantityTypeIdentifierRestingHeartRate" sourceName="Watch" unit="count/min" startDate="2026-10-01 00:00:00 +0200" endDate="2026-10-01 23:00:00 +0200" value="52"/>
 <Record type="HKQuantityTypeIdentifierBodyMass" sourceName="Scale" unit="lb" startDate="2026-10-02 08:00:00 +0200" endDate="2026-10-02 08:00:00 +0200" value="176"/>
 <Record type="HKQuantityTypeIdentifierVO2Max" sourceName="Watch" unit="mL/min·kg" startDate="2026-10-02 08:00:00 +0200" endDate="2026-10-02 08:00:00 +0200" value="48.3"/>
 <Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="50.5" durationUnit="min" sourceName="Jacob&apos;s Watch" startDate="2026-10-01 07:00:00 +0200" endDate="2026-10-01 07:52:00 +0200">
  <MetadataEntry key="HKIndoorWorkout" value="0"/>
  <MetadataEntry key="HKElevationAscended" value="8500 cm"/>
  <WorkoutEvent type="HKWorkoutEventTypeSegment" date="2026-10-01 07:00:00 +0200"/>
  <WorkoutStatistics type="HKQuantityTypeIdentifierHeartRate" startDate="x" endDate="y" average="151.2" minimum="98" maximum="172" unit="count/min"/>
  <WorkoutStatistics type="HKQuantityTypeIdentifierActiveEnergyBurned" sum="640" unit="kcal"/>
  <WorkoutStatistics type="HKQuantityTypeIdentifierDistanceWalkingRunning" sum="10.02" unit="km"/>
 </Workout>
 <Workout workoutActivityType="HKWorkoutActivityTypeTraditionalStrengthTraining" duration="45" durationUnit="min" totalEnergyBurned="300" totalEnergyBurnedUnit="kcal" sourceName="Watch" startDate="2026-10-02 18:00:00 +0200" endDate="2026-10-02 18:45:00 +0200"/>
 <Workout workoutActivityType="HKWorkoutActivityTypeWalking" duration="30" durationUnit="min" totalDistance="1.5" totalDistanceUnit="mi" sourceName="iPhone" startDate="2026-10-03 12:00:00 +0200" endDate="2026-10-03 12:30:00 +0200">
 </Workout>
</HealthData>`;

  it("parses Apple date strings with offsets", () => {
    expect(parseAppleDate("2026-10-01 07:00:00 +0200")?.toISOString()).toBe(
      "2026-10-01T05:00:00.000Z"
    );
  });

  it("extracts workouts with statistics, legacy attributes and metadata", async () => {
    const result = await parseAppleHealthExport(Readable.from([xml]));
    expect(result.activities).toHaveLength(3);

    const run = result.activities[0];
    expect(run.sport).toBe("run");
    expect(run.source).toBe("apple_health");
    expect(run.startDate).toBe("2026-10-01T05:00:00.000Z");
    expect(run.movingTime).toBe(3030);
    expect(run.elapsedTime).toBe(3120);
    expect(run.distance).toBe(10020);
    expect(run.averageHeartrate).toBe(151.2);
    expect(run.maxHeartrate).toBe(172);
    expect(run.calories).toBe(640);
    expect(run.elevationGain).toBe(85);
    expect(run.isIndoor).toBe(false);
    expect(run.name).toBe("Running (Jacob's Watch)");

    const strength = result.activities[1];
    expect(strength.sport).toBe("strength");
    expect(strength.calories).toBe(300);
    expect(strength.distance).toBeUndefined();

    expect(result.activities[2].sport).toBe("walk");
    expect(result.activities[2].distance).toBe(2414);
  });

  it("aggregates health metrics per day and ignores raw heart rate samples", async () => {
    const result = await parseAppleHealthExport(Readable.from([xml]));
    const byMetric = Object.fromEntries(result.metrics.map((m) => [m.metric, m]));
    expect(result.metrics).toHaveLength(3);
    expect(byMetric.resting_hr).toMatchObject({ date: "2026-10-01", value: 51 });
    expect(byMetric.vo2max.value).toBe(48.3);
    expect(byMetric.weight_kg.value).toBeCloseTo(79.8, 1);
  });
});

describe("Garmin account export (summarizedActivities.json)", () => {
  it("converts Garmin's internal units", () => {
    const json = JSON.stringify([
      {
        summarizedActivitiesExport: [
          {
            activityId: 123456,
            name: "Hamburg Running",
            activityType: "running",
            startTimeGmt: Date.UTC(2026, 9, 1, 5, 0, 0),
            duration: 3000000,
            elapsedDuration: 3120000,
            movingDuration: 2990000,
            distance: 1000000,
            elevationGain: 8500,
            avgHr: 150,
            maxHr: 171,
            calories: 2677.76,
          },
          {
            activityId: 2,
            name: "HYROX PFT",
            activityType: "other",
            startTimeGmt: 1,
            duration: 60000,
          },
        ],
      },
    ]);
    const { activities } = parseGarminSummarizedActivities(json);
    expect(activities).toHaveLength(2);
    expect(activities[0]).toMatchObject({
      source: "garmin",
      externalId: "123456",
      sport: "run",
      startDate: "2026-10-01T05:00:00.000Z",
      elapsedTime: 3120,
      movingTime: 2990,
      distance: 10000,
      elevationGain: 85,
      averageHeartrate: 150,
      calories: 640,
    });
    expect(activities[1].sport).toBe("hyrox");
  });

  it("reports invalid JSON as a warning", () => {
    expect(parseGarminSummarizedActivities("{nope").warnings).toHaveLength(1);
  });
});

describe("Garmin Connect Activities.csv", () => {
  it("parses clock and locale numbers", () => {
    expect(parseClock("01:02:03")).toBe(3723);
    expect(parseClock("45:12.4")).toBe(2712);
    expect(parseClock("--")).toBeUndefined();
    expect(parseLocaleNumber("1,234")).toBe(1234);
    expect(parseLocaleNumber("10.02")).toBe(10.02);
    expect(parseLocaleNumber("10,02")).toBe(10.02);
    expect(parseLocaleNumber("1.234,5")).toBe(1234.5);
    expect(parseLocaleNumber("2,000")).toBe(2000);
    expect(parseLocaleNumber("--")).toBeUndefined();
  });

  it("parses the English export", () => {
    const csv = [
      "Activity Type,Date,Favorite,Title,Distance,Calories,Time,Avg HR,Max HR,Total Ascent,Moving Time,Elapsed Time",
      'Running,2026-10-01 07:00:00,false,"Hamburg, Alster Run",10.02,640,00:50:30,151,172,85,00:50:00,00:52:00',
      'Indoor Rowing,2026-10-02 07:00:00,false,Row,"2,000",120,00:08:00,160,175,--,00:08:00,00:08:00',
      "Strength Training,2026-10-03 18:00:00,false,Legs,0.00,300,00:45:00,110,150,--,00:45:00,00:45:00",
    ].join("\n");
    expect(isGarminActivitiesCsv(csv.split("\n")[0])).toBe(true);
    const { activities } = parseGarminActivitiesCsv(csv);
    expect(activities).toHaveLength(3);
    expect(activities[0]).toMatchObject({
      sport: "run",
      name: "Hamburg, Alster Run",
      distance: 10020,
      movingTime: 3000,
      elapsedTime: 3120,
      averageHeartrate: 151,
      elevationGain: 85,
    });
    expect(activities[1]).toMatchObject({ sport: "row", distance: 2000, isIndoor: true });
    expect(activities[2]).toMatchObject({ sport: "strength", distance: undefined });
  });

  it("parses the German export and honours miles", () => {
    const csv = [
      "Aktivitätstyp,Datum,Favorit,Titel,Distanz,Kalorien,Zeit,Ø HF,Max. HF",
      'Laufen,2026-10-01 07:00:00,false,Morgenlauf,"10,02",640,00:50:30,151,172',
    ].join("\n");
    expect(parseGarminActivitiesCsv(csv).activities[0]).toMatchObject({
      sport: "run",
      distance: 10020,
    });
    expect(parseGarminActivitiesCsv(csv, { distanceUnit: "mi" }).activities[0].distance).toBe(
      16126
    );
  });

  it("rejects unrelated CSV files", () => {
    expect(isGarminActivitiesCsv("name,email,phone")).toBe(false);
  });
});

describe("Google Fit and Fitbit", () => {
  it("parses a Google Fit session", () => {
    const session = {
      fitnessActivity: "running",
      startTime: "2026-10-01T05:00:00Z",
      endTime: "2026-10-01T05:52:00Z",
      duration: "3000s",
      aggregate: [
        { metricName: "com.google.distance.delta", floatValue: 10020.4 },
        { metricName: "com.google.calories.expended", floatValue: 640.2 },
        { metricName: "com.google.heart_rate.summary", floatValue: 151 },
        { metricName: "com.google.step_count.delta", intValue: 9000 },
      ],
    };
    expect(isGoogleFitSession(session)).toBe(true);
    const { activities } = parseGoogleFitSession(session, "x.json");
    expect(activities[0]).toMatchObject({
      source: "google_fit",
      sport: "run",
      elapsedTime: 3120,
      movingTime: 3000,
      distance: 10020,
      calories: 640,
      averageHeartrate: 151,
    });
  });

  it("skips sleep sessions", () => {
    const sleep = {
      fitnessActivity: "sleep",
      startTime: "2026-10-01T22:00:00Z",
      endTime: "2026-10-02T06:00:00Z",
    };
    expect(parseGoogleFitSession(sleep, "x.json").activities).toHaveLength(0);
  });

  it("parses a Fitbit exercise log", () => {
    const log = [
      {
        logId: 99,
        activityName: "Run",
        startTime: "10/01/26 05:00:00",
        duration: 3120000,
        activeDuration: 3000000,
        distance: 10.02,
        distanceUnit: "Kilometer",
        averageHeartRate: 151,
        calories: 640,
      },
      { logId: 100, activityName: "Weights", startTime: "10/02/26 16:00:00", duration: 2700000 },
    ];
    expect(isFitbitExerciseLog(log)).toBe(true);
    const { activities } = parseFitbitExerciseLog(log);
    expect(activities[0]).toMatchObject({
      source: "fitbit",
      externalId: "99",
      sport: "run",
      startDate: "2026-10-01T05:00:00.000Z",
      movingTime: 3000,
      distance: 10020,
    });
    expect(activities[1].sport).toBe("strength");
  });
});

describe("TCX / GPX / FIT files", () => {
  it("sums TCX laps without counting trackpoint distances", () => {
    const tcx = `<TrainingCenterDatabase><Activities><Activity Sport="Running">
      <Id>2026-10-01T05:00:00Z</Id>
      <Lap StartTime="2026-10-01T05:00:00Z"><TotalTimeSeconds>1500</TotalTimeSeconds><DistanceMeters>5000</DistanceMeters><Calories>320</Calories>
        <AverageHeartRateBpm><Value>148</Value></AverageHeartRateBpm><MaximumHeartRateBpm><Value>165</Value></MaximumHeartRateBpm>
        <Track><Trackpoint><Time>2026-10-01T05:00:00Z</Time><DistanceMeters>0</DistanceMeters></Trackpoint>
        <Trackpoint><Time>2026-10-01T05:25:00Z</Time><DistanceMeters>5000</DistanceMeters></Trackpoint></Track></Lap>
      <Lap StartTime="2026-10-01T05:25:00Z"><TotalTimeSeconds>1500</TotalTimeSeconds><DistanceMeters>5000</DistanceMeters><Calories>320</Calories>
        <AverageHeartRateBpm><Value>154</Value></AverageHeartRateBpm><MaximumHeartRateBpm><Value>172</Value></MaximumHeartRateBpm>
        <Track><Trackpoint><Time>2026-10-01T05:52:00Z</Time><DistanceMeters>10000</DistanceMeters></Trackpoint></Track></Lap>
    </Activity></Activities></TrainingCenterDatabase>`;
    const [a] = parseTcx(tcx, "run.tcx");
    expect(a).toMatchObject({
      sport: "run",
      startDate: "2026-10-01T05:00:00.000Z",
      movingTime: 3000,
      elapsedTime: 3120,
      distance: 10000,
      averageHeartrate: 151,
      maxHeartrate: 172,
      calories: 640,
    });
  });

  it("computes GPX distance, duration and heart rate from trackpoints", () => {
    const gpx = `<gpx><trk><name>Morning Run</name><type>running</type><trkseg>
      <trkpt lat="53.5500" lon="10.0000"><ele>10</ele><time>2026-10-01T05:00:00Z</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>140</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>
      <trkpt lat="53.5590" lon="10.0000"><ele>20</ele><time>2026-10-01T05:05:00Z</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>160</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>
    </trkseg></trk></gpx>`;
    const [a] = parseGpx(gpx, "run.gpx");
    expect(a.sport).toBe("run");
    expect(a.name).toBe("Morning Run");
    expect(a.elapsedTime).toBe(300);
    expect(a.distance).toBeGreaterThan(990);
    expect(a.distance).toBeLessThan(1010);
    expect(a.averageHeartrate).toBe(150);
    expect(a.elevationGain).toBe(10);
  });

  it("decodes a FIT session", async () => {
    const { Encoder, Profile } = await import("@garmin/fitsdk");
    const encoder = new Encoder();
    const start = new Date("2026-10-01T05:00:00Z");
    encoder.onMesg(Profile.MesgNum.FILE_ID, {
      type: "activity",
      manufacturer: "development",
      timeCreated: start,
    });
    encoder.onMesg((Profile.MesgNum as Record<string, number>).SESSION, {
      timestamp: start,
      startTime: start,
      sport: "running",
      subSport: "treadmill",
      totalElapsedTime: 3120,
      totalTimerTime: 3000,
      totalDistance: 10000,
      avgHeartRate: 151,
      maxHeartRate: 172,
      totalCalories: 640,
    });
    const bytes = encoder.close();
    const [a] = await parseFit(bytes, "run.fit", "garmin");
    expect(a).toMatchObject({
      source: "garmin",
      sport: "run",
      startDate: "2026-10-01T05:00:00.000Z",
      elapsedTime: 3120,
      movingTime: 3000,
      distance: 10000,
      averageHeartrate: 151,
      maxHeartrate: 172,
      calories: 640,
      isIndoor: true,
    });
  });

  it("returns nothing for a file that is not FIT", async () => {
    expect(await parseFit(new Uint8Array([1, 2, 3, 4]), "x.fit")).toEqual([]);
  });
});

describe("cross-source duplicate detection", () => {
  it("matches the same session recorded by two sources", () => {
    expect(
      isSameSession(
        { id: "a", start: 1000, duration: 3000 },
        { id: "b", start: 1060, duration: 3100 }
      )
    ).toBe(true);
  });
  it("keeps sessions with different start times or lengths apart", () => {
    expect(
      isSameSession(
        { id: "a", start: 1000, duration: 3000 },
        { id: "b", start: 1500, duration: 3000 }
      )
    ).toBe(false);
    expect(
      isSameSession(
        { id: "a", start: 1000, duration: 600 },
        { id: "b", start: 1000, duration: 3000 }
      )
    ).toBe(false);
  });
});
