export function parseRotaryYearStart(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}$/u.test(value)) {
    throw new Error("invalid_rotary_year_start");
  }
  const year = Number(value);
  if (!Number.isSafeInteger(year) || year < 2000 || year > 9998) {
    throw new Error("invalid_rotary_year_start");
  }
  return year;
}
