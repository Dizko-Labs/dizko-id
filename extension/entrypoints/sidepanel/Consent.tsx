import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { consent, setConsent, type Consent } from '@/lib/analytics';

/** Dizko's privacy policy, at the section on this extension. */
export const PRIVACY_URL = 'https://www.dizko.app/privacy-policy.html#dizko-id';
const POLICY = 'font-semibold text-toner-1 underline decoration-1 underline-offset-2 hover:text-ink';

/** Asked once, on first run: anonymous usage stays off until the DJ says yes. */
export function ConsentBar() {
  const [answer, setAnswer] = useState<Consent | undefined | null>(null);
  useEffect(() => {
    consent().then(setAnswer);
  }, []);
  if (answer !== undefined) return null;
  const choose = async (value: Consent) => {
    await setConsent(value);
    setAnswer(value);
  };
  return (
    <div role="region" aria-label="Usage data" className="enter-down fixed inset-x-0 bottom-0 z-40 border-t border-toner-3 bg-surface px-4 py-3">
      <p className="text-[13px] leading-snug">
        Share anonymous usage with Dizko? Never your name or what you listen to.{' '}
        <a href={PRIVACY_URL} target="_blank" rel="noreferrer" className={POLICY}>Privacy policy</a>
      </p>
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <Button onClick={() => choose('yes')} className="h-9 text-[14px] font-semibold">Share</Button>
        <Button variant="outline" onClick={() => choose('no')} className="h-9 border-toner-2 bg-transparent text-[14px] font-semibold hover:bg-surface">No thanks</Button>
      </div>
    </div>
  );
}

/** The standing switch, for after the first answer. */
export function UsageSetting() {
  const [answer, setAnswer] = useState<Consent | undefined>();
  useEffect(() => {
    consent().then(setAnswer);
  }, []);
  const flip = async () => {
    const next = answer === 'yes' ? 'no' : 'yes';  // unanswered counts as not shared
    await setConsent(next);
    setAnswer(next);
  };
  return (
    <p className="px-4 py-3 text-[12px] text-toner-2">
      Anonymous usage {answer === 'yes' ? 'shared' : 'not shared'}.{' '}
      <button type="button" onClick={flip} className="font-semibold text-toner-1 underline decoration-1 underline-offset-2 hover:text-ink">
        {answer === 'yes' ? 'Stop sharing' : 'Share'}
      </button>
      <a href={PRIVACY_URL} target="_blank" rel="noreferrer" className={`${POLICY} ml-4`}>Privacy policy</a>
    </p>
  );
}
