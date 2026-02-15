import { describe, it, expect } from 'vitest';
import { parseStatuteText, isChapteredStatute } from '../../src/parsers/provision-parser.js';

describe('parseStatuteText', () => {
  it('should parse a chaptered statute', () => {
    const text = `
1 kap. Inledande bestämmelser

1 § Denna lag kompletterar EU:s dataskyddsförordning.

2 § Lagen gäller vid behandling av personuppgifter.

2 kap. Rättslig grund

1 § Personuppgifter får behandlas om det finns rättslig grund.
    `;

    const provisions = parseStatuteText(text);

    expect(provisions).toHaveLength(3);
    expect(provisions[0]).toEqual({
      provision_ref: '1:1',
      chapter: '1',
      section: '1',
      title: undefined,
      content: 'Denna lag kompletterar EU:s dataskyddsförordning.',
    });
    expect(provisions[1].provision_ref).toBe('1:2');
    expect(provisions[1].chapter).toBe('1');
    expect(provisions[2].provision_ref).toBe('2:1');
    expect(provisions[2].chapter).toBe('2');
  });

  it('should parse a flat statute (no chapters)', () => {
    const text = `
1 § Syftet med denna lag är att skydda personuppgifter.

2 § Lagen gäller alla.

3 § Definitioner anges här.
    `;

    const provisions = parseStatuteText(text);

    expect(provisions).toHaveLength(3);
    expect(provisions[0]).toEqual({
      provision_ref: '1',
      chapter: undefined,
      section: '1',
      title: undefined,
      content: 'Syftet med denna lag är att skydda personuppgifter.',
    });
    expect(provisions[2].provision_ref).toBe('3');
  });

  it('should handle special section numbering (5 a §)', () => {
    const text = `
5 § Grundregel.

5 a § Undantagsregel för viss behandling.

6 § Nästa paragraf.
    `;

    const provisions = parseStatuteText(text);

    expect(provisions).toHaveLength(3);
    expect(provisions[1].provision_ref).toBe('5 a');
    expect(provisions[1].section).toBe('5 a');
  });

  it('should detect rubrik (title) on provisions', () => {
    const text = `
1 kap. Inledande bestämmelser

1 §
Lagens syfte
Denna lag kompletterar EU:s dataskyddsförordning.
    `;

    const provisions = parseStatuteText(text);

    expect(provisions).toHaveLength(1);
    expect(provisions[0].title).toBe('Lagens syfte');
    expect(provisions[0].content).toBe('Denna lag kompletterar EU:s dataskyddsförordning.');
  });

  it('should handle multi-paragraph sections', () => {
    const text = `
1 § Första stycket av paragrafen.
Andra stycket av paragrafen.
Tredje stycket av paragrafen.
    `;

    const provisions = parseStatuteText(text);

    expect(provisions).toHaveLength(1);
    expect(provisions[0].content).toContain('Första stycket');
    expect(provisions[0].content).toContain('Tredje stycket');
  });

  it('should return empty array for empty input', () => {
    expect(parseStatuteText('')).toEqual([]);
  });
});

describe('isChapteredStatute', () => {
  it('should detect chaptered text', () => {
    expect(isChapteredStatute('1 kap. Inledande bestämmelser')).toBe(true);
  });

  it('should detect non-chaptered text', () => {
    expect(isChapteredStatute('1 § Denna lag gäller...')).toBe(false);
  });
});
