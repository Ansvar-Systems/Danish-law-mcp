import { describe, it, expect } from 'vitest';
import { formatCitationTool } from '../../src/tools/format-citation.js';

describe('format_citation tool', () => {
  it('should format a valid SFS citation', async () => {
    const response = await formatCitationTool({
      citation: 'SFS 2018:218 3 kap. 5 §',
    });

    expect(response.results.valid).toBe(true);
    expect(response.results.type).toBe('statute');
    expect(response.results.formatted).toBe('SFS 2018:218 3 kap. 5 §');
  });

  it('should format in short mode', async () => {
    const response = await formatCitationTool({
      citation: 'SFS 2018:218 3 kap. 5 §',
      format: 'short',
    });

    expect(response.results.valid).toBe(true);
    expect(response.results.formatted).toBe('2018:218 3:5');
  });

  it('should format in pinpoint mode', async () => {
    const response = await formatCitationTool({
      citation: 'SFS 2018:218 3 kap. 5 §',
      format: 'pinpoint',
    });

    expect(response.results.valid).toBe(true);
    expect(response.results.formatted).toBe('3 kap. 5 §');
  });

  it('should format a proposition', async () => {
    const response = await formatCitationTool({
      citation: 'Prop. 2017/18:105',
    });

    expect(response.results.valid).toBe(true);
    expect(response.results.type).toBe('bill');
    expect(response.results.formatted).toBe('Prop. 2017/18:105');
  });

  it('should handle empty citation', async () => {
    const response = await formatCitationTool({ citation: '' });

    expect(response.results.valid).toBe(false);
    expect(response.results.error).toBe('Empty citation');
  });

  it('should handle invalid citation', async () => {
    const response = await formatCitationTool({ citation: 'not a citation' });

    expect(response.results.valid).toBe(false);
    expect(response.results.error).toBeDefined();
  });
});
