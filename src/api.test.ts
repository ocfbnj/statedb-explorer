import { describe, it, expect, beforeAll } from 'vitest';

// api.ts runs `init()` at module load, which calls bridge() and logs an error
// when window.stateDB is absent (always true under Vitest). Suppress that
// expected noise before the module is imported so test output stays clean.
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    if (String(args[0] ?? '').includes('DB init failed')) return;
    originalError(...args);
  };
});

import { formatSize, formatSizeNoB, formatTime, formatDuration } from '../src/api';

/**
 * Unit tests for the pure formatter helpers in src/api.ts.
 * These functions are pure and do not touch the Electron IPC bridge,
 * so they can be tested without a running Electron main process.
 */

describe('formatSize', () => {
  it('returns "0 B" for zero, negative, and falsy input', () => {
    expect(formatSize(0)).toBe('0 B');
    expect(formatSize(-5)).toBe('0 B');
    // @ts-expect-error - deliberately test undefined/NaN handling
    expect(formatSize(undefined)).toBe('0 B');
    // @ts-expect-error - deliberately test NaN handling
    expect(formatSize(NaN)).toBe('0 B');
  });

  it('returns raw bytes with a B suffix below 1024', () => {
    expect(formatSize(1)).toBe('1 B');
    expect(formatSize(512)).toBe('512 B');
    expect(formatSize(1023)).toBe('1023 B');
  });

  it('formats kilobytes with one decimal place', () => {
    expect(formatSize(1024)).toBe('1.0 KB');
    expect(formatSize(1536)).toBe('1.5 KB');
    expect(formatSize(1024 * 1024 - 1)).toBe('1024.0 KB');
  });

  it('formats megabytes with one decimal place', () => {
    expect(formatSize(1024 * 1024)).toBe('1.0 MB');
    expect(formatSize(5.25 * 1024 * 1024)).toBe('5.3 MB');
    expect(formatSize(1024 * 1024 * 1024 - 1)).toBe('1024.0 MB');
  });

  it('formats gigabytes with two decimal places', () => {
    expect(formatSize(1024 * 1024 * 1024)).toBe('1.00 GB');
    expect(formatSize(2.5 * 1024 * 1024 * 1024)).toBe('2.50 GB');
  });
});

describe('formatSizeNoB', () => {
  it('returns "0" for zero, negative, and falsy input', () => {
    expect(formatSizeNoB(0)).toBe('0');
    expect(formatSizeNoB(-100)).toBe('0');
  });

  it('returns raw count without a unit suffix below 1024', () => {
    expect(formatSizeNoB(1)).toBe('1');
    expect(formatSizeNoB(999)).toBe('999');
  });

  it('formats thousands with a K suffix and one decimal', () => {
    expect(formatSizeNoB(1024)).toBe('1.0 K');
    expect(formatSizeNoB(794 * 1024)).toBe('794.0 K');
  });

  it('formats millions with an M suffix and one decimal', () => {
    expect(formatSizeNoB(1024 * 1024)).toBe('1.0 M');
    expect(formatSizeNoB(1.6 * 1024 * 1024)).toBe('1.6 M');
  });

  it('formats billions with a G suffix and two decimals', () => {
    expect(formatSizeNoB(1024 * 1024 * 1024)).toBe('1.00 G');
  });
});

describe('formatTime', () => {
  // A fixed epoch timestamp: 2024-01-15 12:34:56 UTC.
  const ts = 1705314896;

  it('returns a localized date/time string without seconds or year', () => {
    const result = formatTime(ts);
    // "MM/DD hh:mm" style; must include a month, day, hour and minute.
    expect(result).toMatch(/\d{2}\/\d{2}/);
    expect(result).toMatch(/\d{2}:\d{2}/);
    // Year must not be present.
    expect(result).not.toContain('2024');
    // Seconds must not be present.
    expect(result).not.toMatch(/:\d{2}:\d{2}/);
  });

  it('converts seconds (not ms) to a date', () => {
    // ts is in seconds; multiplying by 1000 gives a valid epoch ms.
    const d = new Date(ts * 1000);
    expect(formatTime(ts)).toBe(
      d.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    );
  });
});

describe('formatDuration', () => {
  it('formats sub-second durations in milliseconds', () => {
    expect(formatDuration(0.5)).toBe('500ms');
    expect(formatDuration(0.99)).toBe('990ms');
  });

  it('formats seconds with two decimals', () => {
    expect(formatDuration(1)).toBe('1.00s');
    expect(formatDuration(59.5)).toBe('59.50s');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(60)).toBe('1m 0s');
    expect(formatDuration(125)).toBe('2m 5s');
  });
});
