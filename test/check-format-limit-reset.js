'use strict';

const assert = require('assert');
const { formatLimitReset, describe } = require('../lib/format');

console.log('Testing formatLimitReset & session tile rate limit formatting...');

// Reference timestamps:
// Tuesday 2026-11-03 14:00:00 local
const nowTuesday = new Date(2026, 10, 3, 14, 0, 0).getTime();

// 1. Same-day limit reset (today at 18:30) -> only time without weekday
const sameDayReset = new Date(2026, 10, 3, 18, 30, 0).getTime();
assert.strictEqual(
  formatLimitReset(sameDayReset, nowTuesday),
  '18:30 Uhr',
  'Same-day reset must return only HH:MM Uhr'
);

// 2. Next-day limit reset within 24 hours (tomorrow Wednesday at 02:30 -> diff = 12.5h < 24h)
// Former 24-hour rule wrongly returned '02:30 Uhr'. New rule must include weekday 'Mi 02:30 Uhr'.
const nextDayUnder24h = new Date(2026, 10, 4, 2, 30, 0).getTime();
assert.strictEqual(
  formatLimitReset(nextDayUnder24h, nowTuesday),
  'Mi 02:30 Uhr',
  'Next-day reset within 24h must include weekday and not only the time'
);

// 3. Next-day limit reset at 09:15 -> diff = 19h15m < 24h
const nextDayMorning = new Date(2026, 10, 4, 9, 15, 0).getTime();
assert.strictEqual(
  formatLimitReset(nextDayMorning, nowTuesday),
  'Mi 09:15 Uhr',
  'Next-day morning reset within 24h must include weekday'
);

// 4. Same day late evening (23:55) when checked at 01:00 in the morning
const earlyMorning = new Date(2026, 10, 3, 1, 0, 0).getTime();
const lateEvening = new Date(2026, 10, 3, 23, 55, 0).getTime();
assert.strictEqual(
  formatLimitReset(lateEvening, earlyMorning),
  '23:55 Uhr',
  'Same-day late evening reset must return only time'
);

// 5. Several days ahead (Sunday 2026-11-08 at 15:00)
const sundayReset = new Date(2026, 10, 8, 15, 0, 0).getTime();
assert.strictEqual(
  formatLimitReset(sundayReset, nowTuesday),
  'So 15:00 Uhr',
  'Sunday reset must include weekday'
);

// 6. describe() integration with session tile rateLimit
const sessionSameDay = {
  sessionId: 'test-session-1',
  rateLimit: {
    resetsAt: sameDayReset,
    humanText: 'Claude 5h rate limit'
  }
};
assert.strictEqual(
  describe(sessionSameDay, nowTuesday),
  '⏳ Limit bis 18:30 Uhr',
  'describe() for same-day reset must show only time'
);

const sessionNextDay = {
  sessionId: 'test-session-2',
  rateLimit: {
    resetsAt: nextDayUnder24h,
    humanText: 'Antigravity 5h rate limit'
  }
};
assert.strictEqual(
  describe(sessionNextDay, nowTuesday),
  '⏳ Limit bis Mi 02:30 Uhr',
  'describe() for next-day reset within 24h must show weekday + time'
);

// 7. Expired limit handling
const sessionPast = {
  sessionId: 'test-session-3',
  rateLimit: {
    resetsAt: nowTuesday - 1000,
    humanText: 'Limit expired'
  }
};
assert.strictEqual(
  describe(sessionPast, nowTuesday),
  '⚠️ Limit vorbei · Bereit zum Fortsetzen',
  'describe() for past reset must report ready'
);

// 8. Falsy and invalid inputs
assert.strictEqual(formatLimitReset(null, nowTuesday), '', 'null ms should return empty string');
assert.strictEqual(formatLimitReset(undefined, nowTuesday), '', 'undefined ms should return empty string');
assert.strictEqual(formatLimitReset('invalid', nowTuesday), '', 'invalid ms should return empty string');
assert.strictEqual(formatLimitReset(sameDayReset, 'invalid-now'), '', 'invalid now should return empty string');

console.log('✓ All formatLimitReset same-day and weekday tests passed successfully.');

