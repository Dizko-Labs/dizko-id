import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import type { Account } from '@/lib/dizkoAccount';
import type { PanelRequest } from '@/lib/messages';
import { useStored } from './useStored';

const send = (msg: PanelRequest) => browser.runtime.sendMessage(msg);

function ago(t?: number) {
  if (!t) return '';
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Link this library to a Dizko account, so the DJs and artists scanned here shape the Dizko feed. */
export function DizkoLinkBar() {
  // null until read, so a linked account does not flash the link button
  const a = useStored<Account, null>('local', 'dizkoAccount', {}, null);
  const [follow, setFollow] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!a) return null;
  const run = async (msg: PanelRequest) => {
    setBusy(true);
    setError('');
    const r = await send(msg).catch((e) => ({ error: String(e) }));
    setBusy(false);
    if (r?.error) setError(r.error);
  };
  const linked = !!a.access;
  return (
    <section data-area="account" className="px-4 py-3 text-[13px]">
      {linked ? (
        <>
          <p className="leading-snug">
            <span className="font-semibold">Linked to Dizko.</span>{' '}
            <span className="text-toner-1">
              {a.last ? `${a.last.artists} artists in your feed` : 'Your DJs shape your feed'}
              {a.last?.followed ? `, ${a.last.followed} DJs followed` : ''}
              {a.syncedAt ? `, synced ${ago(a.syncedAt)}.` : '.'}
            </span>
          </p>
          <div className="mt-1.5 flex gap-4 text-[12px] font-semibold">
            <button type="button" disabled={busy} onClick={() => run({ type: 'panel:dizko-sync' })} className="underline decoration-1 underline-offset-2 disabled:opacity-50">
              {busy ? 'Syncing…' : 'Sync now'}
            </button>
            <button type="button" disabled={busy} onClick={() => run({ type: 'panel:dizko-unlink' })} className="text-toner-2 hover:text-ink hover:underline">Unlink</button>
          </div>
        </>
      ) : (
        <>
          <p className="leading-snug text-toner-1">
            <span className="font-semibold text-ink">Bring these DJs into your Dizko feed.</span> Sign in or make an account on Dizko; only DJ and artist names go across.
          </p>
          <label className="mt-2.5 flex items-center gap-2 text-[13px]">
            <Checkbox checked={follow} onCheckedChange={(v) => setFollow(v === true)} className="border-toner-2 data-[state=checked]:border-tick data-[state=checked]:bg-tick data-[state=checked]:text-on-tick" />
            Also follow them on Dizko
          </label>
          <Button disabled={busy} onClick={() => run({ type: 'panel:dizko-link', follow })} className="mt-2.5 h-9 w-full text-[14px] font-semibold">
            {busy ? 'Waiting for Dizko…' : 'Link to Dizko'}
          </Button>
        </>
      )}
      {error && <p className="mt-1.5 text-[12px] text-miss">{error}</p>}
    </section>
  );
}
