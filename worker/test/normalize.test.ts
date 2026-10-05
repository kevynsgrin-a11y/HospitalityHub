import { describe, expect, it } from 'vitest';
import { applyUrlHost, canonicalKey, normalize } from '../src/lib/normalize';

describe('normalize', () => {
  it('lowercases and collapses whitespace', () => {
    expect(normalize('  The   BLIND  Burro ')).toBe('the blind burro');
  });

  it('strips punctuation', () => {
    expect(normalize("Joe's Bar & Grill!")).toBe('joe s bar grill');
  });

  it('strips legal suffixes', () => {
    expect(normalize('Blue Water Grill LLC')).toBe('blue water grill');
    expect(normalize('Hospitality Holdings, Inc.')).toBe('hospitality holdings');
    expect(normalize('Tavern Co.')).toBe('tavern');
    expect(normalize('Nightlife Ltd')).toBe('nightlife');
  });

  it('handles null/undefined/empty', () => {
    expect(normalize(null)).toBe('');
    expect(normalize(undefined)).toBe('');
    expect(normalize('')).toBe('');
  });

  it('does not strip suffix-like substrings inside words', () => {
    expect(normalize('Coastal Coffee')).toBe('coastal coffee');
    expect(normalize('Incline Tavern')).toBe('incline tavern');
  });
});

describe('canonicalKey', () => {
  it('builds employer|title|metro', () => {
    expect(canonicalKey("Joe's Bar, LLC", 'Bartender ', 'san-diego')).toBe(
      'joe s bar|bartender|san-diego'
    );
  });

  it('same employer+title in different metros do not collide', () => {
    const a = canonicalKey('Chain House', 'Server', 'san-diego');
    const b = canonicalKey('Chain House', 'Server', 'los-angeles');
    expect(a).not.toBe(b);
  });
});

describe('applyUrlHost', () => {
  it('extracts host', () => {
    expect(applyUrlHost('https://apply.example.com/j/123?x=1')).toBe('apply.example.com');
  });
  it('returns null for invalid or missing URLs', () => {
    expect(applyUrlHost('not a url')).toBeNull();
    expect(applyUrlHost(null)).toBeNull();
  });
});
