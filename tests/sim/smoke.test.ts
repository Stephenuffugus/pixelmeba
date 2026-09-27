import { describe, expect, it } from 'vitest';

describe('toolchain smoke', () => {
  it('runs vitest under the project config', () => {
    expect(1 + 1).toBe(2);
  });
});
