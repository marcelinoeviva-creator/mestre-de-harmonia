/* ============================================================
   sw.js — service worker

   Guarda o app no iPad para que ele abra e funcione sem internet.

   Histórico que explica o desenho: a primeira versão servia o
   index.html do cache e nunca o atualizava. O HTML ficava congelado
   para sempre, e correções publicadas não chegavam ao aparelho.

   Agora:
   - a versão abaixo muda a cada publicação, o que força o iPad a
     reinstalar tudo do zero;
   - navegação vai à rede primeiro (HTML sempre fresco quando há
     internet) e cai no cache quando não há;
   - css/js/imagens saem do cache na hora e se atualizam por trás.
   ============================================================ */

const VERSION = '2026-08-17-g';
const CACHE = 'mh-' + VERSION;

/* Pasta onde o app vive, deduzida da posição deste arquivo. */
const RAIZ = new URL('./', self.location).pathname;

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
  './icons/logo.png',
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

self.addEventListener('message', e => {
  if(e.data === 'atualizar-agora') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if(req.method !== 'GET') return;

  const url = new URL(req.url);
  if(url.origin !== location.origin) return;      // Spotify e capas: sempre da rede

  // O roteiro publicado nunca sai do cache: é conteúdo, não app.
  if(url.pathname.endsWith('/roteiro.json')){
    e.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }

  // Navegação: rede primeiro, para nunca congelar numa versão velha.
  // Só a raiz é o app: outras páginas do site (a apresentação, por
  // exemplo) guardam-se no endereço delas. Sem esta distinção, visitar
  // qualquer página gravaria por cima da cópia offline do painel.
  if(req.mode === 'navigate'){
    const ehApp = url.pathname === RAIZ || url.pathname === RAIZ + 'index.html';
    const chave = ehApp ? './index.html' : req;
    e.respondWith(
      fetch(req)
        .then(res => {
          const copia = res.clone();
          caches.open(CACHE).then(c => c.put(chave, copia));
          return res;
        })
        .catch(() => caches.match(chave))
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
