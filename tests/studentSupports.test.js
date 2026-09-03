import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { removeAccommodationFromList } from "../src/utils/studentSupportUtils.js";

describe("student support accommodations", () => {
  it("removes only the selected accommodation and its nested notes", () => {
    const accommodations = [
      { id: "keep", text: "Extended time", notes: [{ id: "keep-note" }] },
      { id: "remove", text: "Small group", notes: [{ id: "remove-note" }] },
    ];

    const result = removeAccommodationFromList(accommodations, "remove");

    assert.deepEqual(result, [accommodations[0]]);
    assert.equal(accommodations.length, 2);
  });
});
