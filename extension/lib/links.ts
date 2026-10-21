import { searchQuery } from './match';
import { bandcampSearchUrl, beatportSearchUrl } from './stores';
import type { Row } from './types';
import { utm } from './utm';

interface Links {
  beatport: string;
  bandcamp: string;
  spotify: string;
  youtube: string;
}

/** Per-track links: the exact matched release where one was found, otherwise a search for the track. */
export function links(row: Row): Links {
  const q = searchQuery(row.track);
  return {
    beatport: row.offer?.store === 'beatport' ? row.offer.url : beatportSearchUrl(q),
    bandcamp: row.offer?.store === 'bandcamp' ? row.offer.url : bandcampSearchUrl(q),
    spotify: `https://open.spotify.com/search/${encodeURIComponent(q)}`,
    youtube: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${row.track.artist} ${row.track.title}`)}`,
  };
}

/** The same links tagged for a file the DJ takes away (the panel tags its own links when they are clicked). */
export function exportLinks(row: Row): Links {
  const l = links(row);
  return { beatport: utm(l.beatport, 'export', 'beatport'), bandcamp: utm(l.bandcamp, 'export', 'bandcamp'), spotify: utm(l.spotify, 'export', 'spotify'), youtube: utm(l.youtube, 'export', 'youtube') };
}
