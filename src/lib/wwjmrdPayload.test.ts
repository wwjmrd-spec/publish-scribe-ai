import { describe, it, expect } from 'vitest';
import {
  buildAuthors,
  buildReferences,
  parseReference,
} from '../../supabase/functions/publish-to-wwjmrd/wwjmrdPayload';

const profile = {
  full_name: 'Shubham Meena',
  first_name: 'Shubham',
  last_name: 'Meena',
  email: 'Author@Example.com',
  affiliation: 'Profile Dept, University P',
  orcid: '0000-0002-1825-0097',
};

describe('buildAuthors', () => {
  it('keeps the main author first and each co-author with their own affiliation, in order', () => {
    const authors = buildAuthors(
      { name: 'Shubham Meena', affiliation: 'Department A, University A' },
      profile,
      [
        { name: 'Priya Sharma', first_name: 'Priya', last_name: 'Sharma', email: '', affiliation: 'Department B, University B', orcid: null },
        { name: 'Ravi Kumar Verma', email: 'ravi@uni.edu', affiliation: 'Department C, University C', orcid: '0000-0001-5109-3700' },
      ],
    );
    expect(authors.map((a) => a.author_name)).toEqual(['Shubham Meena', 'Priya Sharma', 'Ravi Kumar Verma']);
    expect(authors.map((a) => a.author_role)).toEqual(['corresponding_author', 'co_author', 'co_author']);
    expect(authors.map((a) => a.affiliation)).toEqual(['Department A, University A', 'Department B, University B', 'Department C, University C']);
    expect(authors[0]).toMatchObject({ first_name: 'Shubham', last_name: 'Meena', email: 'author@example.com', orcid_id: '0000-0002-1825-0097' });
    expect(authors[2]).toMatchObject({ first_name: 'Ravi Kumar', last_name: 'Verma', email: 'ravi@uni.edu', orcid_id: '0000-0001-5109-3700' });
  });

  it('uses null for missing optional email, ORCID, designation and affiliation, never the main author\'s values', () => {
    const [, co] = buildAuthors(
      { name: 'Shubham Meena', affiliation: 'Department A, University A' },
      profile,
      [{ name: 'Priya Sharma', email: '', affiliation: '', orcid: '' }],
    );
    expect(co).toMatchObject({ email: null, orcid_id: null, designation: null, affiliation: null });
  });

  it('does not give the account email/affiliation to a differently named printed author', () => {
    const [main] = buildAuthors({ name: 'Dr. Anita Rao', affiliation: null }, profile, []);
    expect(main).toMatchObject({ author_name: 'Dr. Anita Rao', first_name: 'Anita', last_name: 'Rao', email: null, affiliation: null });
  });
});

describe('buildReferences', () => {
  it('reads the formatter list in order with full text, DOI and URL', () => {
    const html = '<h2 class="ww-references-h">References</h2><ol class="ww-references">'
      + '<li>Author A. Example article. Example Journal. 2025;10(2):100-110. https://doi.org/10.1234/example.</li>'
      + '<li>Author B &amp; Author C. Second work. Press; 2020.</li></ol>';
    expect(buildReferences(html)).toEqual([
      { reference_text: 'Author A. Example article. Example Journal. 2025;10(2):100-110. https://doi.org/10.1234/example.', doi: '10.1234/example', url: 'https://doi.org/10.1234/example' },
      { reference_text: 'Author B & Author C. Second work. Press; 2020.', doi: null, url: null },
    ]);
  });

  it('reads edited references stored as numbered blocks after the heading and ignores page numbers', () => {
    const html = '<section><h2 class="ww-references-h">References</h2>'
      + '<div class="ww-body-flow"><span>1.<span>\t</span>Akter, S. (2011). Modeling Quality. ICIS.</span></div>'
      + '<div class="ww-body-flow"><span>2.<span>\t</span>Zeithaml, V. A. (2003). Services Marketing. doi:10.1037/0003-066X.59.1.29</span></div>'
      + '<div><br></div></section></div><div id="ww-page-num-overlay"><div>— 229 —</div></div>';
    const refs = buildReferences(html);
    expect(refs.map((r) => r.reference_text)).toEqual([
      'Akter, S. (2011). Modeling Quality. ICIS.',
      'Zeithaml, V. A. (2003). Services Marketing. doi:10.1037/0003-066X.59.1.29',
    ]);
    expect(refs[1].doi).toBe('10.1037/0003-066X.59.1.29');
  });

  it('returns an empty array when the article has no references', () => {
    expect(buildReferences('<h2>Introduction</h2><p>Body only.</p>')).toEqual([]);
    expect(buildReferences(null)).toEqual([]);
  });

  it('prefers the link written in the reference over the DOI resolver', () => {
    expect(parseReference('X. Title. https://site.org/paper?id=1, 10.5555/abc').url).toBe('https://site.org/paper?id=1');
  });
});

describe('buildReferences inside wrapper blocks', () => {
  it('finds the heading even when it sits inside an outer div', () => {
    const html = '<div class="wwjmrd-article"><section><div class="ww-body-page"><p>Body</p>'
      + '<h2 class="ww-references-h">References</h2><div class="ww-body-flow"><span>1. First ref.</span></div>'
      + '<div class="ww-body-flow"><span>2. Second ref.</span></div></div></section></div>';
    expect(buildReferences(html).map((r) => r.reference_text)).toEqual(['First ref.', 'Second ref.']);
  });
});

import { computeMonthlyOrder, publicationMonthKey } from '../../supabase/functions/publish-to-wwjmrd/wwjmrdPayload';

describe('author email option', () => {
  const co = [{ name: 'Priya Sharma', email: 'priya@uni.edu', affiliation: 'B' }];
  it('sends no emails when the admin has not chosen to add them', () => {
    const authors = buildAuthors({ name: 'Shubham Meena', affiliation: 'A' }, profile, co, { includeEmails: false });
    expect(authors.map((a) => a.email)).toEqual([null, null]);
  });
  it('sends every author email when the option is on, preferring the email printed for the main author', () => {
    const authors = buildAuthors({ name: 'Shubham Meena', affiliation: 'A' }, profile, co, {
      includeEmails: true,
      mainEmail: 'Main@Journal.org',
    });
    expect(authors.map((a) => a.email)).toEqual(['main@journal.org', 'priya@uni.edu']);
  });
});

describe('monthly order', () => {
  const rows = [
    { id: 'a', issue: '10', volume: '12', publication_year: '2026', published_to_wwjmrd_at: '2026-10-02T10:00:00Z', wwjmrd_article_id: 1 },
    { id: 'b', issue: '10', volume: '12', publication_year: null, published_to_wwjmrd_at: '2026-10-05T10:00:00Z', wwjmrd_article_id: 2 },
    { id: 'c', issue: '09', volume: '12', publication_year: '2026', published_to_wwjmrd_at: '2026-09-20T10:00:00Z', wwjmrd_article_id: 3 },
  ];
  it('is 1 for the first article of a month with nothing published yet', () => {
    expect(computeMonthlyOrder('2026-11', 'new', rows)).toBe(1);
  });
  it('counts the articles already published in the same month', () => {
    expect(computeMonthlyOrder('2026-10', 'new', rows)).toBe(3);
    expect(computeMonthlyOrder('2026-09', 'new', rows)).toBe(2);
  });
  it('keeps the position of an article that is already published', () => {
    expect(computeMonthlyOrder('2026-10', 'a', rows)).toBe(1);
    expect(computeMonthlyOrder('2026-10', 'b', rows)).toBe(2);
  });
  it('reads issue 10 / volume 12 as October 2026', () => {
    expect(publicationMonthKey({ id: 'x', issue: '10', volume: '12' })).toBe('2026-10');
  });
});
