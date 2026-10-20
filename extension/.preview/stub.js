// Preview only: stands in for the extension APIs so the built side panel renders in a normal tab. Synthetic job states.
(function () {
  const p = new URLSearchParams(location.search);
  const fixtures = JSON.parse(document.getElementById('fixtures').textContent);
  const job = fixtures[p.get('state') || 'review'] || null;
  const tabUrl = job ? job.mix.url : 'https://example.com/';
  const ev = () => ({ addListener() {}, removeListener() {} });
  globalThis.chrome = globalThis.browser = {
    runtime: { id: 'preview', sendMessage: async () => ({ ok: true }), onMessage: ev(), getURL: (x) => x },
    storage: { session: { get: async () => ({ job }), set: async () => {} }, onChanged: ev() },
    tabs: { query: async () => [{ id: 1, url: p.get('state') === 'empty' ? 'https://example.com/' : tabUrl }], onActivated: ev(), onUpdated: ev() },
    tabCapture: { getMediaStreamId: async () => 'x' },
  };
  document.documentElement.classList.add(p.get('dark') ? 'preview-dark' : 'preview-light');
  if (p.get('w')) document.documentElement.style.setProperty('--w', p.get('w') + 'px');
})();
