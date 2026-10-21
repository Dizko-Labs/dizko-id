import type { App, Service } from './oauth';
import type { PlaylistService, Track } from './types';

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
  track?: Pick<Track, 'artist' | 'title' | 'isrc'>;
  error?: string;
}

/** side panel -> background */
export type PanelRequest =
  | { type: 'panel:read'; tabId: number }
  | { type: 'panel:open'; url: string }
  | { type: 'panel:forget'; url: string }
  | { type: 'panel:identify'; tabId: number }
  | { type: 'panel:toggle'; index: number }
  | { type: 'panel:select'; all: boolean }
  | { type: 'panel:cart'; stores: ('beatport' | 'bandcamp')[] }
  | { type: 'panel:stop' }
  | { type: 'panel:stop-listening' }
  | { type: 'panel:playlist'; service: PlaylistService }
  | { type: 'panel:connect'; service: Service; app: App | undefined }
  | { type: 'panel:reset' };
