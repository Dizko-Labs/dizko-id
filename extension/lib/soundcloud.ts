import { avatarOf, clientIdFrom } from './soundcloudPage';

/** A DJ's other SoundCloud uploads, read from SoundCloud's public web API (the same reads soundcloud.com makes). */
export interface Upload {
  title: string;
  url: string;
  /** seconds */
  duration: number;
  at: string;
  art?: string;
}

let clientId: string | undefined;

/** SoundCloud's public web client id, read from its own scripts as the content script does for streams. */
async function getClientId(): Promise<string> {
  if (clientId) return clientId;
  const found = await clientIdFrom(await fetch('https://soundcloud.com/discover').then((r) => r.text()));
  if (!found) throw new Error('No SoundCloud client id');
  return (clientId = found);
}

/** A SoundCloud profile's picture and its long uploads (20 minutes or more, so mixes rather than single tracks). */
export async function profileMixes(profileUrl: string): Promise<{ avatar?: string; mixes: Upload[] }> {
  const cid = await getClientId();
  const user = await fetch(`https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(profileUrl)}&client_id=${cid}`).then((r) => r.json());
  if (user?.kind !== 'user') return { mixes: [] };
  const avatar = avatarOf(user.avatar_url);
  const list = await fetch(`https://api-v2.soundcloud.com/users/${user.id}/tracks?limit=50&client_id=${cid}`).then((r) => r.json());
  const mixes: Upload[] = (list?.collection ?? [])
    .filter((t: any) => t.duration >= 20 * 60 * 1000)
    .map((t: any) => ({ title: t.title, url: t.permalink_url, duration: t.duration / 1000, at: t.created_at, art: (t.artwork_url ?? t.user?.avatar_url)?.replace('-large', '-t200x200') }));
  return { avatar, mixes };
}

/** Just a profile's picture, sized for the panel, or nothing for SoundCloud's default silhouette. */
export async function profileAvatar(profileUrl: string): Promise<string | undefined> {
  const cid = await getClientId();
  const user = await fetch(`https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(profileUrl)}&client_id=${cid}`).then((r) => r.json());
  return user?.kind === 'user' ? avatarOf(user.avatar_url) : undefined;
}

/** The SoundCloud profile behind a mix URL: https://soundcloud.com/<user>/<track> -> https://soundcloud.com/<user> */
export const profileOf = (mixUrl: string) => {
  const m = mixUrl.match(/^https:\/\/soundcloud\.com\/([^/?#]+)/);
  return m ? `https://soundcloud.com/${m[1]}` : undefined;
};
