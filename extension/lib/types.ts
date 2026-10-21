export type Store = 'beatport' | 'bandcamp';
export type PlaylistService = 'beatport' | 'spotify' | 'soundcloud';

/** One track heard in the mix, from Shazam or from a written tracklist. */
export interface Track {
  /** seconds into the mix where it was first heard (null when the tracklist gave no time) */
  at: number | null;
  artist: string;
  title: string;
  /** Shazam clips that matched; a written tracklist counts as confirmed */
  hits: number;
  isrc?: string;
  /** cover art: Shazam's, else filled in later from the iTunes catalogue */
  art?: string;
  source: 'shazam' | 'tracklist';
}

/** A purchasable copy of a track in one store. */
export interface Offer {
  store: Store | 'spotify' | 'soundcloud';
  id: string;
  url: string;
  artists: string[];
  /** title without the version, e.g. "Needles" */
  title: string;
  /** version as the store names it, e.g. "Original Mix", "Amotik Remix" */
  version: string;
  price?: { value: number; currency: string; display: string };
  isrc?: string;
  art?: string;
  bpm?: number;
  /** Camelot notation, the way DJs mix in key (e.g. 8A), with the musical name */
  key?: { camelot: string; name: string };
  /** seconds */
  length?: number;
  release?: string;
  label?: string;
  /** ISO date, used to prefer original releases over later compilations */
  released?: string;
}

export type Status =
  | 'queued'
  | 'searching'
  | 'carted'
  | 'in-playlist' // in the mix's Beatport playlist, waiting for its Buy All
  | 'version-missing' // the track exists, but not the version that was played
  | 'album-only'
  | 'not-found'
  | 'login-needed'
  | 'failed';

export interface Row {
  track: Track;
  /** the DJ wants this one in the cart; confirmed tracks start ticked, single-hit IDs start unticked */
  selected: boolean;
  status: Status;
  offer?: Offer;
  /** other versions seen, so a version-missing row can say what does exist */
  alternatives?: Offer[];
  note?: string;
  /** stores that were searched and did not have it (or not this version) */
  missingFrom?: Store[];
}

import type { Artist } from './dizko';

export interface Job {
  mix: { title: string; url: string; duration?: number; uploader?: string; art?: string; artistCheckedAt?: number };
  /** the DJ, when Dizko knows them */
  artist?: Artist;
  rows: Row[];
  phase: 'reading' | 'identifying' | 'review' | 'carting' | 'done';
  /** 0..1 progress through the audio while identifying */
  progress?: number;
  /** the description held a written tracklist, so no listening was needed */
  tracklistFound?: boolean;
  /** how identification will get audio: SoundCloud's own stream, seeking the page's player, or listening live */
  method?: 'stream' | 'seek' | 'live';
  waitingFor?: 'beatport-login' | 'store-check';
  /** still identifying in the background; true alongside a cart run started mid-listen */
  listening?: boolean;
  /** new finds go straight into the mix's Beatport playlist while listening continues */
  following?: boolean;
  /**
   * Where to review each store's cart. Beatport has a cart page; Bandcamp's cart is a sidebar on any
   * item page, so its link is the last track added.
   */
  carts?: Partial<Record<Store, string>>;
  /** the playlist made for this mix, by store; Beatport's is reused on later runs */
  playlist?: { beatport?: number };
  /** playlists made from the ticked tracks, by service */
  made?: Partial<Record<PlaylistService, { url: string; added: number; missing: string[]; at: number }>>;
  /** the tracks have been looked up on Beatport once for BPM, key and length */
  enriched?: boolean;
  /** a playlist is being made right now */
  making?: PlaylistService;
  error?: string;
}

/**
 * How far a listen got, 0..1: the recorded progress, else (mixes saved before it was recorded) the last found
 * track's time over the mix's length. A finished or never-listened mix has nothing to estimate.
 */
export function coverage(job: Job): number | undefined {
  if (job.progress != null) return job.progress;
  if (job.tracklistFound || !job.mix.duration || !job.rows.length) return undefined;
  const last = Math.max(...job.rows.map((r) => r.track.at ?? 0));
  return Math.min(1, (last + 60) / job.mix.duration);
}

/** Rows a Beatport press picks up (a playlist row gets carted by Buy All) */
export const BEATPORT_CARTABLE: Status[] = ['queued', 'failed', 'login-needed', 'in-playlist'];
/** Bandcamp also takes what Beatport did not have */
export const BANDCAMP_CARTABLE: Status[] = ['queued', 'failed', 'login-needed', 'not-found', 'version-missing'];
