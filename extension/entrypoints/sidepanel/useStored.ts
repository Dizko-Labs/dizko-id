import { useEffect, useState } from 'react';

/**
 * A value in extension storage, kept current as it changes. `loading` (when given) is returned until the first read,
 * so a screen can wait instead of flashing the fallback.
 */
export function useStored<T, L = T>(area: 'session' | 'local', key: string, fallback: T, ...loading: [L?]): T | L {
  const [value, setValue] = useState<T | L>(loading.length ? (loading[0] as L) : fallback);
  useEffect(() => {
    browser.storage[area].get(key).then((r) => setValue((r[key] as T) ?? fallback));
    const onChange = (changes: Record<string, { newValue?: unknown }>, changed: string) => {
      if (changed === area && key in changes) setValue((changes[key]!.newValue as T) ?? fallback);
    };
    browser.storage.onChanged.addListener(onChange);
    return () => browser.storage.onChanged.removeListener(onChange);
  }, []);
  return value;
}
