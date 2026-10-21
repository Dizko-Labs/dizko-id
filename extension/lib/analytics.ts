/**
 * Anonymous usage events, sent to PostHog's capture API only after the DJ agrees (asked once, on first run).
 * An event carries a random install id and counts or categories: never track names, account details, tokens or
 * the URLs of the DJ's own pages. No SDK: one POST per event, so nothing runs that is not in this bundle.
 */
// PostHog project API keys are public by design (they only allow sending events). Empty means analytics is off.
const POSTHOG_KEY = '';
const POSTHOG_HOST = 'https://us.i.posthog.com';

export type Consent = 'yes' | 'no';

export async function consent(): Promise<Consent | undefined> {
  return (await browser.storage.local.get('analytics')).analytics as Consent | undefined;
}

export async function setConsent(value: Consent) {
  await browser.storage.local.set({ analytics: value });
}

export async function installId(): Promise<string> {
  const stored = (await browser.storage.local.get('installId')).installId as string | undefined;
  if (stored) return stored;
  const id = crypto.randomUUID();
  await browser.storage.local.set({ installId: id });
  return id;
}

/** Record one event if the DJ agreed and a project key is set; never throws, never blocks the caller. */
export async function track(event: string, properties: Record<string, string | number | boolean | undefined> = {}) {
  try {
    if (!POSTHOG_KEY || (await consent()) !== 'yes') return;
    await fetch(`${POSTHOG_HOST}/i/v0/e/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        api_key: POSTHOG_KEY,
        event,
        distinct_id: await installId(),
        timestamp: new Date().toISOString(),
        properties: { ...properties, $process_person_profile: false, app: 'dizko_id', version: browser.runtime.getManifest().version },
      }),
    });
  } catch {
    // analytics never gets in the way
  }
}

/** Only the host of a destination, so a click says where it went without carrying the full address. */
export const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
};
