import { exportLinks } from './links';
import type { Job, Row } from './types';

/** A position in a mix as h:mm:ss or m:ss. */
export const time = (s: number | null | undefined) => {
  if (s == null) return '';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`;
};

const STATUS: Record<Row['status'], string> = {
  queued: 'Not carted', searching: 'Not carted', carted: 'In cart', 'in-playlist': 'In Beatport playlist',
  'version-missing': 'Version not found', 'album-only': 'Album only', 'not-found': 'Not found',
  'login-needed': 'Not carted', failed: 'Not carted',
};

export function toText(job: Job): string {
  const lines = job.rows.map((r) => {
    const l = exportLinks(r);
    return `${time(r.track.at).padStart(7)}  ${r.track.artist} - ${r.track.title}${r.track.hits < 2 ? '  (unconfirmed)' : ''}\n         Beatport ${l.beatport}\n         Bandcamp ${l.bandcamp}\n         Spotify ${l.spotify}\n         YouTube ${l.youtube}`;
  });
  return `${job.mix.title}\n${job.mix.url}\n\n${lines.join('\n')}\n`;
}

const csvCell = (v: string | number | undefined) => {
  let s = v == null ? '' : String(v);
  // a cell a spreadsheet would read as a formula (titles come from Shazam and uploaders) is kept as text
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(job: Job): string {
  const head = ['time', 'artist', 'title', 'confirmed', 'selected', 'status', 'store', 'version', 'price', 'currency', 'beatport', 'bandcamp', 'spotify', 'youtube'];
  const rows = job.rows.map((r) => {
    const l = exportLinks(r);
    return [
      time(r.track.at), r.track.artist, r.track.title, r.track.hits >= 2 ? 'yes' : 'no', r.selected ? 'yes' : 'no', STATUS[r.status],
      r.offer?.store, r.offer?.version, r.offer?.price?.value, r.offer?.price?.currency, l.beatport, l.bandcamp, l.spotify, l.youtube,
    ].map(csvCell).join(',');
  });
  return [head.join(','), ...rows].join('\n') + '\n';
}

export function toJson(job: Job): string {
  return JSON.stringify({
    mix: job.mix.title,
    source: job.mix.url,
    tracks: job.rows.map((r) => ({
      at: time(r.track.at), artist: r.track.artist, title: r.track.title, hits: r.track.hits,
      confident: r.track.hits >= 2, selected: r.selected, status: r.status, offer: r.offer ?? null, links: exportLinks(r),
    })),
  }, null, 1);
}

export function fileName(job: Job, ext: string): string {
  return `${job.mix.title.replace(/[^\w\s.-]+/g, '').trim().slice(0, 80) || 'tracklist'}.${ext}`;
}
