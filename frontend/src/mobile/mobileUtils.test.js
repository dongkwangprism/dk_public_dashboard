import { describe, expect, it } from "vitest";
import {
  isMobileMediaQuery,
  mergeUpcomingRows,
  mobileBidOpacity,
  mobileDdayTone,
} from "./mobileUtils.js";

describe("mobile UI helpers", () => {
  it("uses the required 767px media query", () => {
    expect(isMobileMediaQuery).toBe("(max-width: 767px)");
  });

  it("maps bid urgency and fades bids later than D-10", () => {
    expect(mobileDdayTone(3)).toBe("red");
    expect(mobileDdayTone(7)).toBe("orange");
    expect(mobileDdayTone(8)).toBe("green");
    expect(mobileBidOpacity(10)).toBe(1);
    expect(mobileBidOpacity(11)).toBe(0.55);
  });

  it("places specs before plans and sorts specs by deadline", () => {
    const result = mergeUpcomingRows(
      [{ id: "p1", dday: 1 }, { id: "p2", dday: -1 }],
      [{ id: "s2", dday: 5 }, { id: "s1", dday: 2 }]
    );

    expect(result.map((row) => `${row.kind}:${row.id}`)).toEqual([
      "spec:s1",
      "spec:s2",
      "plan:p1",
      "plan:p2",
    ]);
  });
});
