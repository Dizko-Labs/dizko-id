/**
 * Every link out of the extension carries UTM parameters, so the places it sends people can see the traffic
 * came from Dizko ID: utm_source=dizko_id, utm_medium=extension, utm_campaign=<panel area>, utm_content=<link>.
 */
export function utm(url: string, area: string, content?: string): string {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return url;
    u.searchParams.set('utm_source', 'dizko_id');
    u.searchParams.set('utm_medium', 'extension');
    u.searchParams.set('utm_campaign', area);
    if (content) u.searchParams.set('utm_content', content.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40));
    return u.href;
  } catch {
    return url;
  }
}

/**
 * A mix's identity without tracking or player parameters: YouTube keeps only the video id, everything else drops
 * its query and fragment. Tagged links and shared URLs then land on the same saved mix.
 */
export function cleanMixUrl(url: string): string {
  try {
    const u = new URL(url);
    if (/(^|\.)youtube\.com$/.test(u.hostname)) {
      const v = u.searchParams.get('v');
      return v ? `https://www.youtube.com/watch?v=${v}` : `${u.origin}${u.pathname}`;
    }
    return `${u.origin}${u.pathname}`.replace(/\/$/, '');
  } catch {
    return url;
  }
}
