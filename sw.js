/* ============================================================
   sw.js — service worker

   Guarda o app inteiro no iPad para que ele abra e funcione sem
   internet. O que depende da rede (API do Spotify, capas) nunca
   é armazenado: passa direto e falha em silêncio se não houver
   conexão.
   ============================================================ */

const CACHE = 'mh-v1';

const SHELL = [
  './',
  './index.html',
  './css/app.css',
  './js/app.js',
  './js/store.js',
  './js/audio.js',
  './js/spotify.js',
  './js/ui.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-180.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('Pré-carga incompleta', err))
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if(req.method !== 'GET') return;

  const url = new URL(req.url);
  if(url.origin !== location.origin) return;      // Spotify e capas: sempre da rede

  // Navegação: serve o app da memória e atualiza por baixo.
  if(req.mode === 'navigate'){
    e.respondWith(
      caches.match('./index.html').then(hit => hit || fetch(req))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(hit => {
      const net = fetch(req).then(res => {
        if(res.ok) caches.open(CACHE).then(c => c.put(req, res.clone()));
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
