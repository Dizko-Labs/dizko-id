/** PKCE for an OAuth sign-in through chrome.identity (used to link a Dizko account). */
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** A PKCE verifier, its S256 challenge, and a state value for one sign-in. */
export async function pkce() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  return { verifier, challenge, state: b64url(crypto.getRandomValues(new Uint8Array(12))) };
}
