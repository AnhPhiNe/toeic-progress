// Network-only PWA: account sync requires a live connection; no learning data is cached.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(() => new Response(
    // Same warm look as the public pages (no network: system font, inline art of a cloud over the meadow).
    '<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Chưa kết nối · TOEIC Progress</title>' +
    '<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#fff8ee;color:#2f3a33;font:600 16px/1.6 Nunito,system-ui,sans-serif">' +
    '<main style="max-width:420px;padding:24px 16px;text-align:center">' +
    '<svg viewBox="0 0 200 110" width="200" height="110" aria-hidden="true"><ellipse cx="100" cy="100" rx="90" ry="10" fill="#cdeccb"/><g fill="#fff" stroke="#f1dcc0" stroke-width="2"><ellipse cx="100" cy="62" rx="62" ry="18"/><ellipse cx="80" cy="50" rx="26" ry="18"/><ellipse cx="116" cy="44" rx="30" ry="22"/></g><path d="M86 58 q4 -4 8 0 M106 58 q4 -4 8 0" fill="none" stroke="#3a2a1e" stroke-width="3" stroke-linecap="round"/><text x="150" y="26" font-size="16" font-weight="900" fill="#a78bfa">z</text><text x="162" y="14" font-size="12" font-weight="900" fill="#a78bfa">z</text></svg>' +
    '<h1 style="margin:14px 0 6px;font-size:24px;font-weight:900">Chưa kết nối</h1><p style="margin:0;color:#5f6b64">TOEIC Progress cần mạng để mở ứng dụng. Dữ liệu đã lưu trên máy vẫn được giữ nguyên.</p>' +
    '<a href="" style="display:inline-block;text-decoration:none;margin-top:20px;border:0;border-radius:16px;padding:13px 26px;background:#46b35a;color:#fff;font:900 16px Nunito,system-ui,sans-serif;box-shadow:0 5px 0 #2f8a42">Thử lại</a></main></body></html>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  )));
});
