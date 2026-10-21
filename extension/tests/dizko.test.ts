import { describe, expect, it } from 'vitest';
import { candidates } from '../lib/dizko';

describe('candidates', () => {
  it('pulls the DJ out of common mix titles', () => {
    expect(candidates('Kerri Chandler Boiler Room Mix', 'Kerri Chandler')).toEqual(['Kerri Chandler']);
    expect(candidates('Honey Dijon | Boiler Room: London')[0]).toBe('Honey Dijon');
    expect(candidates('Derrick Carter Soulful House Mix | Boiler Room x Ballantines', 'Platform')).toContain('Derrick Carter Soulful House');
  });
});
