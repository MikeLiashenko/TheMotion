import { describe, expect, it } from 'vitest';
import { levelForGraphics, QUALITY, segments } from './quality';

describe('quality', () => {
  it('asks less of phones, built-in graphics and software renderers', () => {
    expect(levelForGraphics('ANGLE (NVIDIA, NVIDIA GeForce RTX 5080 Laptop GPU Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe('high');
    expect(levelForGraphics('ANGLE (AMD, AMD Radeon RX 7800 XT Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe('high');
    expect(levelForGraphics('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe('medium');
    expect(levelForGraphics('ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe('medium');
    expect(levelForGraphics('Apple GPU')).toBe('medium');
    expect(levelForGraphics('Mali-G78 MP14')).toBe('low');
    expect(levelForGraphics('Adreno (TM) 740')).toBe('low');
    expect(levelForGraphics('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)')).toBe('low');
    // A card that says nothing about itself is given the benefit of the doubt: the engine trims the resolution if it struggles.
    expect(levelForGraphics('')).toBe('high');
  });

  it('builds the scene in full where there is no browser to ask', () => {
    expect(QUALITY.level).toBe('high');
    expect(QUALITY.detail).toBe(1);
    expect(QUALITY.minDpr).toBeLessThan(QUALITY.maxDpr);
    expect(segments(20)).toBe(20);
    expect(segments(4)).toBe(6);
  });
});
