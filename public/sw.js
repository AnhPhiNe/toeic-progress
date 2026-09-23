// Network-only PWA: account sync requires a live connection; no learning data is cached.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(() => new Response(
    '<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Chưa kết nối · TOEIC Progress</title><body style="font:16px system-ui;background:#EAEFF5;color:#172033;padding:32px;max-width:560px;margin:auto"><h1>Chưa kết nối</h1><p>TOEIC Progress cần mạng để mở ứng dụng. Dữ liệu đã lưu trên máy vẫn được giữ nguyên.</p><button onclick="location.reload()" style="padding:10px 16px">Thử lại</button></body></html>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  )));
});
