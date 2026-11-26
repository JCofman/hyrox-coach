import { describe, it, expect } from "vitest";
import {
  isShortcutExport,
  parseLooseDate,
  parseLooseDistance,
  parseLooseDuration,
  parseLooseNumber,
  parseShortcutExport,
} from "../../src/import/shortcut.js";

describe("shortcut export: loose value parsing", () => {
  it.each([
    ["10.4", 10.4],
    ["10,4", 10.4],
    ["1,234", 1234],
    ["1.234,5", 1234.5],
    ["1,234.5", 1234.5],
    ["742 kcal", 742],
    ["48 count/min", 48],
    ["", undefined],
    ["n/a", undefined],
  ])("number %s", (input, expected) => {
    expect(parseLooseNumber(input)).toBe(expected);
  });

  it.each([
    ["1:02:33", 3753],
    ["62:33", 3753],
    ["62 min", 3720],
    ["1 hr 2 min", 3720],
    ["1,5 Std.", 5400],
    ["3753", 3753],
  ])("duration %s", (input, expected) => {
    expect(parseLooseDuration(input)).toBe(expected);
  });

  it.each([
    ["10.4 km", 10400],
    ["10,4 km", 10400],
    ["5000 m", 5000],
    ["1 mi", 1609.344],
    ["8", 8000],
    ["8000", 8000],
  ])("distance %s", (input, expected) => {
    expect(parseLooseDistance(input)).toBeCloseTo(expected as number, 3);
  });

  it("reads ISO, Apple and day-first dates", () => {
    expect(parseLooseDate("2026-11-10T07:02:11+01:00")?.toISOString()).toBe(
      "2026-11-10T06:02:11.000Z"
    );
    expect(parseLooseDate("2026-11-10 07:02:11 +0100")?.toISOString()).toBe(
      "2026-11-10T06:02:11.000Z"
    );
    const local = parseLooseDate("10.11.2026, 07:02");
    expect(local?.getFullYear()).toBe(2026);
    expect(local?.getMonth()).toBe(10);
    expect(local?.getDate()).toBe(10);
    expect(local?.getHours()).toBe(7);
    expect(parseLooseDate("nonsense")).toBeUndefined();
  });
});

describe("parseShortcutExport", () => {
  const text = [
    "hyrox-coach export v1",
    "workout; start=2026-11-10T07:02:11+01:00; type=Running; duration=1:02:33; distance=10,4 km; kcal=742; hr=151; maxhr=176",
    "workout; start=2026-11-11T18:30:00+01:00; end=2026-11-11T19:15:00+01:00; type=Krafttraining; kcal=1200 kJ",
    "workout; start=2026-11-12T18:00:00+01:00; type=Other; name=HYROX Sim; duration=75 min",
    "workout; start=2026-11-10T07:02:11+01:00; type=Running; duration=1:02:33",
    "workout; start=; type=Running",
    "metric; type=Resting Heart Rate; date=2026-11-10T00:00:00+01:00; value=48",
    "metric; type=Heart Rate Variability; date=2026-11-10T03:00:00+01:00; value=60 ms",
    "metric; type=Heart Rate Variability; date=2026-11-10T05:00:00+01:00; value=70 ms",
    "metric; type=VO2 Max; date=2026-11-09T00:00:00+01:00; value=51,3",
    "metric; type=Weight; date=2026-11-09T07:00:00+01:00; value=176 lb",
    "metric; type=Steps; date=2026-11-09T07:00:00+01:00; value=9000",
    "",
  ].join("\n");

  it("is detected by its marker", () => {
    expect(isShortcutExport(text)).toBe(true);
    expect(isShortcutExport("just some notes")).toBe(false);
  });

  it("reads workouts, skipping repeats and unreadable ones", () => {
    const { activities, warnings } = parseShortcutExport(text);
    expect(activities).toHaveLength(3);
    const [run, strength, sim] = activities;
    expect(run).toMatchObject({
      source: "apple_health",
      sport: "run",
      startDate: "2026-11-10T06:02:11.000Z",
      elapsedTime: 3753,
      distance: 10400,
      calories: 742,
      averageHeartrate: 151,
      maxHeartrate: 176,
    });
    expect(run.averageSpeed).toBeCloseTo(10400 / 3753, 5);
    expect(strength.sport).toBe("strength");
    expect(strength.elapsedTime).toBe(45 * 60);
    expect(strength.calories).toBeCloseTo(1200 / 4.184, 3);
    expect(sim.sport).toBe("hyrox");
    expect(sim.elapsedTime).toBe(75 * 60);
    expect(warnings).toHaveLength(1);
  });

  it("reads daily metrics, averaging and converting units", () => {
    const { metrics } = parseShortcutExport(text);
    const get = (metric: string, date: string) =>
      metrics.find((m) => m.metric === metric && m.date === date)?.value;
    expect(metrics).toHaveLength(4);
    expect(get("resting_hr", "2026-11-10")).toBe(48);
    expect(get("hrv_sdnn", "2026-11-10")).toBe(65);
    expect(get("vo2max", "2026-11-09")).toBe(51.3);
    expect(get("weight_kg", "2026-11-09")).toBeCloseTo(79.8, 1);
  });

  it("accepts the JSON form", () => {
    const json = JSON.stringify({
      "hyrox-coach": 1,
      workouts: [
        { start: "2026-11-10T07:02:11+01:00", type: "Rowing", duration: 1800, distance: "6500 m" },
      ],
      metrics: [{ type: "Resting Heart Rate", date: "2026-11-10", value: 47 }],
    });
    const { activities, metrics } = parseShortcutExport(json);
    expect(activities[0]).toMatchObject({ sport: "row", elapsedTime: 1800, distance: 6500 });
    expect(metrics[0]).toMatchObject({ metric: "resting_hr", date: "2026-11-10", value: 47 });
  });
});
