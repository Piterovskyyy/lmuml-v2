import { describe, expect, it } from "vitest";
import { draftChanged, draftFromScore, scoreFromDraft } from "./prediction-score";

describe("prediction draft preview", () => {
  it("keeps an absent prediction empty and a saved zero visible", () => {
    expect(draftFromScore(null)).toEqual({ home: "", away: "" });
    expect(draftFromScore({ home: 0, away: 0 })).toEqual({ home: "0", away: "0" });
    expect(scoreFromDraft({ home: "0", away: "0" })).toEqual({ home: 0, away: 0 });
  });

  it.each(["", " ", "-1", "1.5", "1e1", "+2", "100", "NaN", "2x"])(
    "rejects incomplete or malformed goal input %j without converting it to zero",
    (value) => {
      expect(scoreFromDraft({ home: value, away: "1" })).toBeNull();
      expect(scoreFromDraft({ home: "1", away: value })).toBeNull();
    },
  );

  it("accepts complete two-digit input within the preview control limit", () => {
    expect(scoreFromDraft({ home: "12", away: "99" })).toEqual({ home: 12, away: 99 });
  });

  it("marks a partially filled prediction as changed but not saveable", () => {
    const draft = { home: "2", away: "" };
    expect(draftChanged(draft, null)).toBe(true);
    expect(scoreFromDraft(draft)).toBeNull();
    expect(draftChanged({ home: "", away: "" }, null)).toBe(false);
  });

  it("clears the dirty state when the original score is restored", () => {
    const saved = { home: 0, away: 2 };
    expect(draftChanged({ home: "1", away: "2" }, saved)).toBe(true);
    expect(draftChanged({ home: "", away: "2" }, saved)).toBe(true);
    expect(draftChanged({ home: "0", away: "2" }, saved)).toBe(false);
    expect(draftChanged({ home: "00", away: "02" }, saved)).toBe(false);
  });
});
