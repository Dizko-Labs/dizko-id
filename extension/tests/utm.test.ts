import { describe, expect, it } from 'vitest';
import { cleanMixUrl, utm } from '../lib/utm';

describe('utm', () => {
  it('tags a link with source, medium, area and a slug of its label', () => {
    const u = new URL(utm('https://www.beatport.com/search/tracks?q=x', 'tracklist', 'Beatport'));
    expect(u.searchParams.get('q')).toBe('x');
    expect(u.searchParams.get('utm_source')).toBe('dizko_id');
    expect(u.searchParams.get('utm_medium')).toBe('extension');
    expect(u.searchParams.get('utm_campaign')).toBe('tracklist');
    expect(u.searchParams.get('utm_content')).toBe('beatport');
  });
  it('leaves non-web links alone', () => {
    expect(utm('mailto:a@b.c', 'x')).toBe('mailto:a@b.c');
  });
});

describe('cleanMixUrl', () => {
  it('keeps a YouTube video id and nothing else', () => {
    expect(cleanMixUrl('https://www.youtube.com/watch?v=7MLRfIoSbdY&t=30s&utm_source=dizko_id')).toBe('https://www.youtube.com/watch?v=7MLRfIoSbdY');
  });
  it('drops query and fragment elsewhere', () => {
    expect(cleanMixUrl('https://soundcloud.com/kerri-chandler/boiler-room-mix?utm_source=dizko_id&si=abc#t=1:00')).toBe('https://soundcloud.com/kerri-chandler/boiler-room-mix');
  });
});
