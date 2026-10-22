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

  it('AI terms cannot override the built-in spelling', () => {
    const r = formatAcademicTitle('DEATH RITES AND CHRISTIAN MISSION', { mode: 'title', terms: [{ form: 'CHRISTIAN', kind: 'proper', source: 'ai' }] });
    expect(r.text).toBe('Death Rites and Christian Mission');
  });

  it('flags lowercase ambiguous genus names instead of guessing', () => {
    const r = tc('aloe vera gel in burns');
    expect(r.html).not.toContain('<em>');
    expect(r.flags.some((f) => f.message.includes('Aloe vera'))).toBe(true);
  });
});

import { applyTitleToFormattedHtml, readFormattedTitle } from './academicTitle';

describe('writing the title into formatted HTML', () => {
  const html = '<style>.x{}</style><section class="ww-first-page"><h1>the role of co<sub>2</sub> in plants</h1><p>Rao A. the role of co2 in plants. <em>WWJMRD</em></p></section>';

  it('keeps subscripts when only letter case changes and updates the citation', () => {
    const r = applyTitleToFormattedHtml(html, 'The Role of Co2 in Plants', 'The Role of Co2 in Plants', ['the role of co2 in plants']);
    expect(r.markupReset).toBe(false);
    expect(r.html).toContain('<h1>The Role of Co<sub>2</sub> in Plants</h1>');
    expect(r.html).toContain('Rao A. The Role of Co2 in Plants.');
    expect(r.html).toContain('<style>');
    expect(readFormattedTitle(r.html)).toBe('The Role of Co2 in Plants');
  });

  it('restoring puts the original title back without data loss', () => {
    const accepted = applyTitleToFormattedHtml(html, 'The Role of Co2 in Plants', 'The Role of Co2 in Plants', ['the role of co2 in plants']).html;
    const restored = applyTitleToFormattedHtml(accepted, 'the role of co2 in plants', 'the role of co2 in plants', ['The Role of Co2 in Plants']).html;
    expect(restored).toBe(html);
  });

  it('writes italics for scientific names into a plain heading', () => {
    const plain = '<h1>activity of escherichia coli</h1>';
    const t = formatAcademicTitle('activity of escherichia coli', { mode: 'title' });
    expect(applyTitleToFormattedHtml(plain, t.text, t.html).html).toBe('<h1>Activity of <em>Escherichia coli</em></h1>');
  });
});
