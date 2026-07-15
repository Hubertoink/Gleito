import { describe, expect, it } from 'vitest';
import { mergeSettings } from './db';

describe('settings migration', () => {
  it('migrates untouched legacy time account defaults to the current defaults', () => {
    const settings = mergeSettings({
      overtimeLimitMinutes: 40 * 60,
      trafficThresholds: {
        plusGreenUntilMinutes: 20 * 60,
        plusYellowUntilMinutes: 40 * 60,
        plusRedFromMinutes: 60 * 60,
        minusGreenUntilMinutes: 10 * 60,
        minusYellowUntilMinutes: 10 * 60,
        minusRedFromMinutes: 11 * 60
      }
    });

    expect(settings.overtimeLimitMinutes).toBe(60 * 60);
    expect(settings.trafficThresholds).toEqual({
      plusGreenUntilMinutes: 25 * 60,
      plusYellowUntilMinutes: 40 * 60,
      plusRedFromMinutes: 41 * 60,
      minusGreenUntilMinutes: 10 * 60,
      minusYellowUntilMinutes: 20 * 60,
      minusRedFromMinutes: 21 * 60
    });
  });

  it('keeps customized traffic threshold groups', () => {
    const settings = mergeSettings({
      trafficThresholds: {
        plusGreenUntilMinutes: 24 * 60,
        plusYellowUntilMinutes: 39 * 60,
        plusRedFromMinutes: 59 * 60,
        minusGreenUntilMinutes: 10 * 60,
        minusYellowUntilMinutes: 10 * 60,
        minusRedFromMinutes: 11 * 60
      }
    });

    expect(settings.trafficThresholds.plusGreenUntilMinutes).toBe(24 * 60);
    expect(settings.trafficThresholds.plusYellowUntilMinutes).toBe(39 * 60);
    expect(settings.trafficThresholds.plusRedFromMinutes).toBe(59 * 60);
    expect(settings.trafficThresholds.minusYellowUntilMinutes).toBe(20 * 60);
    expect(settings.trafficThresholds.minusRedFromMinutes).toBe(21 * 60);
  });
});
