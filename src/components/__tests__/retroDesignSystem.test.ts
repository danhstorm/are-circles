import { describe, expect, it } from 'vitest';

import { companionSurfaces, synthSkins } from '@/components/retroDesignSystem';

describe('retroDesignSystem', () => {
  it('defines unique synth skins plus companion surfaces', () => {
    expect(Object.keys(synthSkins)).toEqual(['pling', 'plong', 'bong', 'pad', 'vr']);
    expect(Object.values(synthSkins).every((skin) => skin.displayFont.length > 0 && skin.labelFont.length > 0)).toBe(true);
    expect(companionSurfaces.setup.style).toBe('companion-rack');
    expect(companionSurfaces.live.style).toBe('companion-remote');
  });
});
