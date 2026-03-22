// Anti-spam utilities for bot/spam detection

// Honeypot: if this field is filled, it's a bot
export function isHoneypotFilled(value: string): boolean {
  return value.trim().length > 0;
}

// Timing check: forms filled too quickly are likely bots
export function isSubmissionTooFast(startTime: number, minSeconds: number = 5): boolean {
  const elapsed = (Date.now() - startTime) / 1000;
  return elapsed < minSeconds;
}

// Spam content patterns
const SPAM_PATTERNS = [
  /\+\d{10,}/g, // Phone numbers repeated
  /pills?\s+(for\s+sale|available|in\s+)/i,
  /abortion/i,
  /buy\s+(online|now|cheap)/i,
  /viagra|cialis|casino|lottery|winner/i,
  /click\s+here\s+to\s+(buy|order|get)/i,
  /whatsapp\s*[\+\d]/i,
  /telegram\s*[\+@]/i,
  /SEO\s+services?/i,
  /cheap\s+(price|rate|offer)/i,
  /call\s+(now|us|me)\s*[\+\d]/i,
  /(\+\d{7,}\s*){3,}/i, // 3+ phone numbers
];

// Check if content is spammy
export function isSpamContent(text: string): boolean {
  if (!text) return false;
  
  let matchCount = 0;
  for (const pattern of SPAM_PATTERNS) {
    if (pattern.test(text)) {
      matchCount++;
    }
  }
  // 2+ spam pattern matches = spam
  if (matchCount >= 2) return true;

  // Excessive repetition detection (same phrase repeated 5+ times)
  const words = text.toLowerCase().split(/\s+/);
  if (words.length > 20) {
    const phrases = new Map<string, number>();
    for (let i = 0; i < words.length - 2; i++) {
      const phrase = words.slice(i, i + 3).join(' ');
      phrases.set(phrase, (phrases.get(phrase) || 0) + 1);
    }
    for (const count of phrases.values()) {
      if (count >= 5) return true;
    }
  }

  return false;
}

// Validate article content is not spam
export function validateArticleContent(title: string, abstract: string): { valid: boolean; reason?: string } {
  if (isSpamContent(title)) {
    return { valid: false, reason: 'Your article title contains content that was flagged as spam. Please use a proper academic title.' };
  }
  if (isSpamContent(abstract)) {
    return { valid: false, reason: 'Your article abstract contains content that was flagged as spam. Please provide a proper academic abstract.' };
  }
  
  // Title should be reasonable length and not just numbers/symbols
  if (title.trim().length < 10) {
    return { valid: false, reason: 'Article title must be at least 10 characters.' };
  }
  
  // Check if title has actual words (not just numbers/symbols)
  const wordCount = title.trim().split(/\s+/).filter(w => /[a-zA-Z]{2,}/.test(w)).length;
  if (wordCount < 3) {
    return { valid: false, reason: 'Article title must contain at least 3 meaningful words.' };
  }

  return { valid: true };
}
