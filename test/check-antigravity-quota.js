'use strict';

const assert = require('assert');
const { parseLiveQuotaGroups, resolveAntigravityReset } = require('../lib/quota');
const { friendlyModel } = require('../lib/format');

console.log('Testing Antigravity Argon quota parsing...');

// 1. Mock groups exactly matching actual RetrieveUserQuotaSummary response
const mockGroups = [
  {
    displayName: 'Gemini Models',
    description: 'Models within this group: Gemini Flash, Gemini Pro',
    buckets: [
      {
        bucketId: 'gemini-weekly',
        displayName: 'Weekly Limit Remaining',
        description: 'You have used some of your weekly limit, it will fully refresh in 6 days, 23 hours.',
        window: 'weekly',
        remainingFraction: 0.9974774,
        resetTime: '2026-10-23T05:10:12Z'
      },
      {
        bucketId: 'gemini-5h',
        displayName: 'Five Hour Limit Remaining',
        description: 'You have used some of your 5-hour limit, it will fully refresh in 4 hours, 58 minutes.',
        window: '5h',
        remainingFraction: 0.99117094,
        resetTime: '2026-10-16T10:10:12Z'
      }
    ]
  },
  {
    displayName: 'Claude and GPT models',
    description: 'Models within this group: Claude Opus, Claude Sonnet, GPT-OSS',
    buckets: [
      {
        bucketId: '3p-weekly',
        displayName: 'Weekly Limit Remaining',
        window: 'weekly',
        remainingFraction: 1,
        resetTime: '2026-10-23T05:12:10Z'
      },
      {
        bucketId: '3p-5h',
        displayName: 'Five Hour Limit Remaining',
        window: '5h',
        remainingFraction: 1,
        resetTime: '2026-10-16T10:12:10Z'
      }
    ]
  },
  {
    displayName: 'Gemini 4 Argon',
    description: 'For paid Pro plans, Argon quota is separate. Higher Argon quota (included as part of the larger Gemini quota bucket) is available on Ultra plans.',
    buckets: [
      {
        bucketId: 'gemini-argon-wtu-weekly',
        displayName: 'Gemini 4 Argon Weekly Limit',
        window: 'weekly',
        remainingFraction: 0.85,
        resetTime: '2026-10-23T05:12:10Z'
      }
    ]
  }
];

const result = parseLiveQuotaGroups(mockGroups);

// Assertions
assert.strictEqual(result.hasLiveQuota, true, 'hasLiveQuota must be true');

// Check Gemini models (Flash/Pro)
assert.ok(result.gemini, 'gemini group must exist');
assert.strictEqual(result.gemini.fiveHour.percent, 1, 'gemini 5h used percentage should be 1%');
assert.strictEqual(result.gemini.weekly.percent, 0, 'gemini weekly used percentage should be 0% (rounded from 0.0025)');

// Check Argon
assert.ok(result.argon, 'argon group must exist');
assert.strictEqual(result.argon.weekly.percent, 15, 'argon weekly used percentage should be 15%');
assert.ok(result.argon.weekly.resetsAt > 0, 'argon weekly resetsAt must be parsed');
assert.strictEqual(result.argon.fiveHour, null, 'argon 5h should be null currently');

// Ensure Gemini weekly was NOT overwritten by Argon weekly
assert.notStrictEqual(result.gemini.weekly.percent, result.argon.weekly.percent, 'gemini weekly must not be overwritten by argon');

// Check 3P models
assert.ok(result.thirdParty, 'thirdParty group must exist');
assert.strictEqual(result.thirdParty.fiveHour.percent, 0, '3p 5h should be 0%');
assert.strictEqual(result.thirdParty.weekly.percent, 0, '3p weekly should be 0%');

// Test resolveAntigravityReset with an exhausted Argon quota (remainingFraction 0 and near-zero fractional quota)
const exhaustedArgonQuota = {
  available: true,
  argon: {
    weekly: {
      remainingFraction: 0,
      resetsAt: Date.now() + 3600000
    }
  }
};
const resetTime = resolveAntigravityReset('session-test-argon', Date.now(), exhaustedArgonQuota);
assert.strictEqual(resetTime, exhaustedArgonQuota.argon.weekly.resetsAt, 'resolveAntigravityReset should identify exhausted Argon bucket');

const nearZeroArgonQuota = {
  available: true,
  argon: {
    weekly: {
      percent: 99,
      remainingFraction: 0.0074512,
      resetsAt: Date.now() + 7200000
    }
  }
};
const nearZeroResetTime = resolveAntigravityReset('session-test-argon-fraction', Date.now(), nearZeroArgonQuota);
assert.strictEqual(nearZeroResetTime, nearZeroArgonQuota.argon.weekly.resetsAt, 'resolveAntigravityReset should identify near-zero Argon bucket as exhausted');

// Test friendlyModel for Argon
assert.strictEqual(friendlyModel('gemini-4-argon'), 'Gemini 4 Argon');
assert.strictEqual(friendlyModel('argon'), 'Gemini 4 Argon');

console.log('✓ All Antigravity Argon quota tests passed successfully.');
