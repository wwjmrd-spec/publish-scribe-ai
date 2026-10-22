import { describe, it, expect } from 'vitest';
import { formatAcademicTitle, parseTerminology } from '../../supabase/functions/_shared/academicTitle';

const tc = (s: string, guide: 'apa' | 'chicago' | 'vancouver' = 'apa') => formatAcademicTitle(s, { mode: 'title', styleGuide: guide });
const sc = (s: string, guide: 'apa' | 'chicago' | 'vancouver' = 'apa') => formatAcademicTitle(s, { mode: 'sentence', styleGuide: guide });

describe('academic title capitalization', () => {
  it('Example A: keeps WWJMRD in every mode', () => {
    const t = 'the role of artificial intelligence in academic publishing at WWJMRD';
    expect(tc(t).text).toBe('The Role of Artificial Intelligence in Academic Publishing at WWJMRD');
    expect(sc(t).text).toBe('The role of artificial intelligence in academic publishing at WWJMRD');
    expect(formatAcademicTitle(t, { mode: 'preserve' }).text).toBe(t);
    expect(formatAcademicTitle(t, { mode: 'custom' }).text).toContain('WWJMRD');
    expect(tc('a study at wwjmrd').text).toBe('A Study at WWJMRD');
  });

  it('Example B: scientific name gets genus capital, species lowercase, italics', () => {
    const t = 'the antimicrobial activity of escherichia coli isolates';
    const r = tc(t);
    expect(r.text).toBe('The Antimicrobial Activity of Escherichia coli Isolates');
    expect(r.html).toContain('<em>Escherichia coli</em>');
    expect(sc(t).text).toBe('The antimicrobial activity of Escherichia coli isolates');
    expect(sc(t).html).toContain('<em>Escherichia coli</em>');
  });

  it('Example C: multiple acronyms', () => {
    const t = 'an analysis of ai, dna, rna and pcr applications in healthcare';
    expect(tc(t).text).toBe('An Analysis of AI, DNA, RNA and PCR Applications in Healthcare');
    expect(sc(t).text).toBe('An analysis of AI, DNA, RNA and PCR applications in healthcare');
  });

  it('Example D: COVID-19 and PCR', () => {
    const t = 'a study of covid-19 detection using pcr and artificial intelligence';
    expect(tc(t).text).toBe('A Study of COVID-19 Detection Using PCR and Artificial Intelligence');
    expect(sc(t).text).toBe('A study of COVID-19 detection using PCR and artificial intelligence');
  });

  it('Example E: subtitle follows the style guide', () => {
    const t = 'the antimicrobial activity of escherichia coli: a laboratory study';
    expect(sc(t, 'vancouver').text).toBe('The antimicrobial activity of Escherichia coli: a laboratory study');
    expect(sc(t, 'apa').text).toBe('The antimicrobial activity of Escherichia coli: A laboratory study');
    expect(tc(t).text).toBe('The Antimicrobial Activity of Escherichia coli: A Laboratory Study');
  });

  it('keeps HIV, eGFR, ChatGPT, mRNA and abbreviations unchanged', () => {
    expect(tc('role of ChatGPT and eGFR in HIV care').text).toBe('Role of ChatGPT and eGFR in HIV Care');
    expect(tc('mRNA vaccines in india').text).toBe('mRNA Vaccines in India');
    expect(tc('egfr decline in ckd').text).toBe('eGFR Decline in CKD');
    expect(tc('resistance in e. coli strains').text).toBe('Resistance in E. coli Strains');
  });

  it('Title Case and Sentence case differ', () => {
    const t = 'impact of social media on students';
    expect(tc(t).text).not.toBe(sc(t).text);
  });

  it('APA lowercases short minor words only; Chicago lowercases all prepositions', () => {
    const t = 'learning with games through play';
    expect(tc(t, 'apa').text).toBe('Learning With Games Through Play');
    expect(tc(t, 'chicago').text).toBe('Learning with Games through Play');
  });

  it('Chicago capitalizes the last word', () => {
    expect(tc('what students are looking for', 'chicago').text).toBe('What Students Are Looking For');
  });

  it('keeps colons, parentheses, hyphens, Greek letters and formulae intact', () => {
    const r = tc('β-lactamase activity of CO2-treated cells (in vitro): a self-report study');
    expect(r.text).toBe('β-lactamase Activity of CO2-Treated Cells (in vitro): A Self-Report Study');
    expect(tc('effect of H2O2 on NaCl uptake').text).toBe('Effect of H2O2 on NaCl Uptake');
  });

  it('never changes letters other than their case', () => {
    const titles = [
      'An analysis of ai, dna; rna — and “pcr” (2020–2024)!',
      'teacher–student relationships in uttar pradesh',
      "children's well-being: an over-the-counter review",
    ];
    for (const t of titles) {
      for (const mode of ['title', 'sentence', 'custom', 'preserve'] as const) {
        const out = formatAcademicTitle(t, { mode }).text;
        expect(out.toLowerCase().replace(/\s+/g, '')).toBe(t.toLowerCase().replace(/\s+/g, ''));
      }
    }
  });

  it('does not turn the pronoun "who" into WHO', () => {
    expect(tc('people who teach').text).toBe('People Who Teach');
    expect(tc('guidelines by the WHO').text).toBe('Guidelines by the WHO');
  });

  it('journal policy (custom) keeps helping words small', () => {
    expect(formatAcademicTitle('a review of yoga versus exercise for anxiety in women', { mode: 'custom' }).text)
      .toBe('A Review of Yoga versus Exercise for Anxiety in Women');
  });

  it('uses journal terminology entries', () => {
    const terms = parseTerminology(JSON.stringify([{ form: 'NAAC', kind: 'acronym' }]));
    expect(formatAcademicTitle('naac accreditation of colleges', { mode: 'title', terms }).text).toBe('NAAC Accreditation of Colleges');
  });

  it('flags lowercase ambiguous genus names instead of guessing', () => {
    const r = tc('aloe vera gel in burns');
    expect(r.html).not.toContain('<em>');
    expect(r.flags.some((f) => f.message.includes('Aloe vera'))).toBe(true);
  });
});
