import type { Track } from './types';

/** background -> content script on the mix page */
export type SourceRequest =
  | { type: 'source:info' }
  /** what SoundCloud's player bar has loaded, on any page (search, a profile, the feed) */
  | { type: 'source:playing' }
  | { type: 'source:seek'; at: number }
  | { type: 'source:pause' }
  /** `seconds` of the page player's own audio as 16 kHz mono, muting the player first when `mute` */
  | { type: 'source:clip'; seconds: number; mute: boolean }
  | { type: 'source:release' };

/** A clip from the page's player: 16-bit PCM, base64, mono at `rate`. */
export interface PageClip {
  pcm?: string;
  rate?: number;
  error?: string;
}

/** Set as the job's error when a page will not hand over its player's audio, so the panel falls back to tab capture. */
export const TAB_AUDIO_NEEDED = 'This page will not share its player audio; Chrome tab capture is needed.';

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
  | { type: 'offscreen:pcm'; pcm: string; rate: number }
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
  /** `auto`: the panel found it in the player by itself, so it must not cut off another mix that is running */
  | { type: 'panel:scan'; url: string; auto?: boolean }
  | { type: 'panel:dizko-link'; follow: boolean }
  | { type: 'panel:dizko-sync' }
  | { type: 'panel:dizko-unlink' }
  /** listen to the mix in a tab, or (SoundCloud) by its URL with no tab; `range` is the stretch to hear, in seconds */
  | { type: 'panel:identify'; tabId?: number; url?: string; resume?: boolean; range?: [number, number] }
  | { type: 'panel:switch'; tabId: number }
  | { type: 'panel:toggle'; index: number }
  | { type: 'panel:select'; all: boolean }
  | { type: 'panel:cart'; stores: ('beatport' | 'bandcamp')[] }
  | { type: 'panel:stop' }
  | { type: 'panel:stop-listening' }
  | { type: 'panel:reset' };
