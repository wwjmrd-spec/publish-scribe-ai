import { describe, expect, it } from 'vitest';
import { getAuthorDoiState } from './doi';

describe('author DOI visibility', () => {
  it('requires payment even when a DOI is already assigned', () => {
    expect(getAuthorDoiState({ doi_paid: false, doi_number: '10.67967/wwjmrd.1', status: 'published' })).toBe('unpaid');
  });
  it.each(['published', 'published_to_wwjmrd', 'updated_published'])('shows a paid DOI for %s', (status) => {
    expect(getAuthorDoiState({ doi_paid: true, doi_number: '10.67967/wwjmrd.1', status })).toBe('registered');
  });
  it('hides the payment button while waiting for publication or assignment', () => {
    expect(getAuthorDoiState({ doi_paid: true, doi_number: '10.67967/wwjmrd.1', status: 'paid' })).toBe('pending');
    expect(getAuthorDoiState({ doi_paid: true, status: 'published' })).toBe('pending');
  });
});