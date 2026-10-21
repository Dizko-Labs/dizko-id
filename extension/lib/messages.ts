import type { Track } from './types';

/** background -> content script on the mix page */
export type SourceRequest =
  | { type: 'source:info' }
  | { type: 'source:seek'; at: number }
  | { type: 'source:pause' };

export interface SourceInfo {
  title: string;
  url: string;
  description: string;
  duration?: number;
  /** the channel or account that posted the mix, often the DJ */
  uploader?: string;
  /** the mix's artwork or thumbnail (the page's og:image) */
  art?: string;
  /** the uploader's profile picture, where the page says */
  uploaderAvatar?: string;
  /** a media element the content script can seek; without one we listen in real time */
  seekable: boolean;
  /** SoundCloud: the mix's own HLS segments, fingerprinted directly instead of capturing tab audio */
  stream?: Stream;
}

export interface Stream {
  init?: string;
  segments: { start: number; dur: number; url: string }[];
}

/** background -> offscreen document */
export type OffscreenRequest =
  | { type: 'offscreen:start'; streamId: string }
  | { type: 'offscreen:clip'; seconds: number }
  | { type: 'offscreen:segment'; init?: string; url: string }
  | { type: 'offscreen:stop' };

export interface ClipResult {
  track?: Pick<Track, 'artist' | 'title' | 'isrc' | 'art'>;
  error?: string;
}

/** side panel -> background */
export type PanelRequest =
  | { type: 'panel:read'; tabId: number }
  | { type: 'panel:open'; url: string }
  | { type: 'panel:forget'; url: string }
  | { type: 'panel:profile-mixes'; url: string }
  | { type: 'panel:scan'; url: string }
  | { type: 'panel:dizko-link'; follow: boolean }
  | { type: 'panel:dizko-sync' }
  | { type: 'panel:dizko-unlink' }
  | { type: 'panel:identify'; tabId: number; resume?: boolean }
  | { type: 'panel:switch'; tabId: number }
  | { type: 'panel:toggle'; index: number }
  | { type: 'panel:select'; all: boolean }
  | { type: 'panel:cart'; stores: ('beatport' | 'bandcamp')[] }
  | { type: 'panel:stop' }
  | { type: 'panel:stop-listening' }
  | { type: 'panel:reset' };
