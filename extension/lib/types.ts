export type Store = 'beatport' | 'bandcamp';

/** One track heard in the mix, from Shazam or from a written tracklist. */
export interface Track {
  /** seconds into the mix where it was first heard (null when the tracklist gave no time) */
  at: number | null;
  artist: string;
  title: string;
  /** Shazam clips that matched; a written tracklist counts as confirmed */
  hits: number;
  isrc?: string;
  source: 'shazam' | 'tracklist';
}

/** A purchasable copy of a track in one store. */
export interface Offer {
  store: Store;
  id: string;
  url: string;
  artists: string[];
  /** title without the version, e.g. "Needles" */
  title: string;
  /** version as the store names it, e.g. "Original Mix", "Amotik Remix" */
  version: string;
  price?: { value: number; currency: string; display: string };
  isrc?: string;
  release?: string;
  label?: string;
  /** ISO date, used to prefer original releases over later compilations */
  released?: string;
}

export type Status =
  | 'queued'
  | 'searching'
  | 'carted'
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
}

export interface Job {
  mix: { title: string; url: string; duration?: number };
  rows: Row[];
  phase: 'reading' | 'identifying' | 'review' | 'carting' | 'done';
  /** 0..1 progress through the audio while identifying */
  progress?: number;
  /** the description held a written tracklist, so no listening was needed */
  tracklistFound?: boolean;
  /** how identification will get audio: SoundCloud's own stream, seeking the page's player, or listening live */
  method?: 'stream' | 'seek' | 'live';
  waitingFor?: 'beatport-login' | 'store-check';
  /**
   * Where to review each store's cart. Beatport has a cart page; Bandcamp's cart is a sidebar on any
   * item page, so its link is the last track added.
   */
  carts?: Partial<Record<Store, string>>;
  error?: string;
}
