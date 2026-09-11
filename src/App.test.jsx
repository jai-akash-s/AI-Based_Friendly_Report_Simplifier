import { describe, expect, it } from 'vitest';

describe('frontend configuration', () => {
  it('has a browser location available for protected navigation', () => {
    expect(window.location).toBeDefined();
  });
});
