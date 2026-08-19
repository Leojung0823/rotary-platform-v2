import { describe, expect, it } from "vitest";
import { parseOptionalVenueLocation, validateEventCreateForm, initialEventCreateFormValues } from "./validation";

describe("venue location parsing", () => {
  it("treats an empty value as no GPS venue", () => {
    expect(parseOptionalVenueLocation("")).toBeNull();
    expect(parseOptionalVenueLocation(null)).toBeNull();
    expect(parseOptionalVenueLocation("   ")).toBeNull();
  });

  it("accepts a plain coordinate pair", () => {
    expect(parseOptionalVenueLocation("25.033964, 121.564468")).toEqual({
      latitude: 25.033964,
      longitude: 121.564468,
    });
    expect(parseOptionalVenueLocation("25.033964,121.564468")).toEqual({
      latitude: 25.033964,
      longitude: 121.564468,
    });
    expect(parseOptionalVenueLocation("-33.8688, 151.2093")).toEqual({
      latitude: -33.8688,
      longitude: 151.2093,
    });
  });

  it("extracts coordinates from the map URLs a secretary would actually paste", () => {
    expect(parseOptionalVenueLocation("https://www.google.com/maps/@25.033964,121.564468,17z")).toEqual({
      latitude: 25.033964,
      longitude: 121.564468,
    });
    expect(parseOptionalVenueLocation("https://maps.google.com/?q=25.033964,121.564468")).toEqual({
      latitude: 25.033964,
      longitude: 121.564468,
    });
    expect(
      parseOptionalVenueLocation("https://www.google.com/maps/place/X/data=!3d25.033964!4d121.564468"),
    ).toEqual({ latitude: 25.033964, longitude: 121.564468 });
  });

  it("rejects out-of-domain and unparseable values", () => {
    expect(() => parseOptionalVenueLocation("91, 121.5")).toThrow("invalid_event_venue_location");
    expect(() => parseOptionalVenueLocation("25.03, 181")).toThrow("invalid_event_venue_location");
    expect(() => parseOptionalVenueLocation("台北市信義區")).toThrow("invalid_event_venue_location");
    expect(() => parseOptionalVenueLocation("25.033964")).toThrow("invalid_event_venue_location");
  });

  it("rounds to the precision the venue column stores", () => {
    expect(parseOptionalVenueLocation("25.0339641234, 121.5644681234")).toEqual({
      latitude: 25.033964,
      longitude: 121.564468,
    });
  });
});

describe("event create form with a venue", () => {
  const baseValues = {
    ...initialEventCreateFormValues,
    title: "八月例會",
    startsAt: "2099-08-20T12:00",
    endsAt: "2099-08-20T14:00",
    registrationDeadline: "2099-08-19T12:00",
  };

  it("keeps the venue optional", () => {
    const result = validateEventCreateForm(baseValues);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.input.venue).toBeNull();
  });

  it("carries a parsed venue through to the RPC input", () => {
    const result = validateEventCreateForm({ ...baseValues, venueLocation: "25.033964, 121.564468" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.input.venue).toEqual({ latitude: 25.033964, longitude: 121.564468 });
  });

  it("reports a field-level error and preserves input when the venue cannot be read", () => {
    const result = validateEventCreateForm({ ...baseValues, venueLocation: "台北 101" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.venueLocation).toBeTruthy();
  });
});
