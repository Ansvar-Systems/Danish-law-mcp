import { describe, it, expect } from 'vitest';
import { parseRiksdagenProvisions } from '../../src/parsers/riksdagen-provision-parser.js';

describe('parseRiksdagenProvisions', () => {
  it('captures title lines that appear before section markers', () => {
    const text = `
1 kap. Inledande bestämmelser

Lagens syfte
1 § Denna lag gäller.
2 § Nästa bestämmelse.
`;

    const result = parseRiksdagenProvisions(text);

    expect(result.provisions).toHaveLength(2);
    expect(result.provisions[0].provision_ref).toBe('1:1');
    expect(result.provisions[0].title).toBe('Lagens syfte');
    expect(result.provisions[0].content).toBe('Denna lag gäller.');
  });

  it('ignores spurious chapter markers when the next section does not restart at 1 §', () => {
    const text = `
2 kap. Om svensk rätts tillämplighet
1 § Första bestämmelsen.
5 § Femte bestämmelsen.
6 kap. Om sexualbrott
6 § Sjätte bestämmelsen i samma kapitel.
7 § Sjunde bestämmelsen i samma kapitel.
3 kap. Om påföljder
1 § Första bestämmelsen i nytt kapitel.
`;

    const result = parseRiksdagenProvisions(text);
    const refs = result.provisions.map(p => p.provision_ref);

    expect(refs).toEqual(['2:1', '2:5', '2:6', '2:7', '3:1']);
    expect(result.diagnostics.ignored_chapter_markers).toBe(1);
  });

  it('suppresses inline lower-case section-like references inside a provision', () => {
    const text = `
1 kap. Inledande bestämmelser
1 § Huvudregel.
2 § ska tillämpas i vissa fall.
fortsatt text i samma paragraf.
2 § Den andra paragrafen börjar här.
`;

    const result = parseRiksdagenProvisions(text);

    expect(result.provisions).toHaveLength(2);
    expect(result.provisions[0].provision_ref).toBe('1:1');
    expect(result.provisions[0].content).toContain('2 § ska tillämpas i vissa fall.');
    expect(result.provisions[1].provision_ref).toBe('1:2');
    expect(result.diagnostics.suppressed_section_candidates).toBe(1);
  });

  it('suppresses out-of-order section candidates that re-use an earlier section number', () => {
    const text = `
1 kap. Testkapitel
1 § Första paragraf.
2 § Andra paragraf.
1 § återges här endast som hänvisning.
3 § Tredje paragraf.
`;

    const result = parseRiksdagenProvisions(text);

    expect(result.provisions).toHaveLength(3);
    expect(result.provisions[1].provision_ref).toBe('1:2');
    expect(result.provisions[1].content).toContain('1 § återges här endast som hänvisning.');
    expect(result.provisions[2].provision_ref).toBe('1:3');
    expect(result.diagnostics.suppressed_section_candidates).toBe(1);
  });

  it('suppresses suspicious large section jumps in flat statutes', () => {
    const text = `
1 § Första paragraf.
2 § Andra paragraf.
3 § Vid tillämpning av 5 a, 6 h, 7 a, 11, 15, 22, 25, 26 och
39 § gäller följande särskilda bestämmelser om beräkning av anställningstid.
4 § Fjärde paragraf.
`;

    const result = parseRiksdagenProvisions(text);
    const refs = result.provisions.map(p => p.provision_ref);

    expect(refs).toEqual(['1', '2', '3', '4']);
    expect(result.provisions[2].content).toContain('39 § gäller följande särskilda bestämmelser');
    expect(result.diagnostics.suppressed_section_candidates).toBe(1);
  });
});
