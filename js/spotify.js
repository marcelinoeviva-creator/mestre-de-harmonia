/* ============================================================
   spotify.js

   Dois níveis, propositalmente:

   1. MODO LINK (sem configurar nada)
      Cola-se o link da faixa; o título vem do oEmbed público do
      Spotify (sem login) e tocar abre o app do Spotify no iPad.

   2. MODO CONECTADO (opcional, exige Premium e um Client ID)
      Login por PKCE — sem servidor e sem senha guardada no app.
      Permite importar playlists inteiras, tocar sem sair do
      painel, ver o que está tocando e controlar o volume.

   O que NENHUM dos dois faz: tocar duas faixas do Spotify ao
   mesmo tempo. A API só comanda um player. Sobreposição real
   só na mesa de som local (audio.js).
   ============================================================ */

const AUTH   = 'https://accounts.spotify.com/authorize';
const TOKEN  = 'https://accounts.spotify.com/api/token';
const API    = 'https://api.spotify.com/v1';
const SCOPES = [
  'user-read-private',            // sem este, /me omite o plano (product) da conta
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'playlist-read-collaborative'
].join(' ');

const TOK_KEY = 'mh:sp:token';
const VER_KEY = 'mh:sp:verifier';

export const auth = { token: null, expires: 0, refresh: null };

/* ── Links ────────────────────────────────── */

/** Aceita link https, URI spotify: ou o id cru. */
export function parseLink(input){
  const s = (input || '').trim();
  if(!s) return null;
  let m = s.match(/^spotify:(track|playlist|album|episode):([A-Za-z0-9]{22})/i);
  if(m) return { type: m[1].toLowerCase(), id: m[2] };
  m = s.match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(track|playlist|album|episode)\/([A-Za-z0-9]{22})/i);
  if(m) return { type: m[1].toLowerCase(), id: m[2] };
  if(/^[A-Za-z0-9]{22}$/.test(s)) return { type: 'track', id: s };
  return null;
}

export const webUrl = (type, id) => `https://open.spotify.com/${type}/${id}`;
export const uri    = (type, id) => `spotify:${type}:${id}`;

/** Metadados básicos sem nenhum login. Devolve null se falhar. */
export async function oembed(type, id){
  try{
    const r = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(webUrl(type, id))}`);
    if(!r.ok) return null;
    const j = await r.json();
    return { title: j.title || '', artwork: j.thumbnail_url || '' };
  }catch(e){ return null; }
}

/** Abre a faixa no app do Spotify do iPad.
    Um <a> clicado é mais confiável que location.href quando o app
    roda em tela cheia (standalone) no iPadOS. */
export function openExternally(type, id, preferApp = true){
  const a = document.createElement('a');
  a.href = preferApp ? uri(type, id) : webUrl(type, id);
  a.rel = 'noreferrer';
  if(!preferApp) a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/* ── Login PKCE ───────────────────────────── */

export function redirectUri(){
  return (location.origin + location.pathname).replace(/index\.html$/, '');
}

const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf)))
  .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');

async function challenge(verifier){
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return b64url(digest);
}

export async function login(clientId){
  if(!clientId) throw new Error('Falta o Client ID do Spotify.');
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  localStorage.setItem(VER_KEY, verifier);
  const p = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri(),
    code_challenge_method: 'S256',
    code_challenge: await challenge(verifier),
    scope: SCOPES
  });
  location.href = `${AUTH}?${p}`;
}

/** Chamado na volta do login. Devolve 'ok', 'none' ou lança erro. */
export async function handleRedirect(clientId){
  const q = new URLSearchParams(location.search);
  const code = q.get('code');
  const err  = q.get('error');
  if(err){ clean(); throw new Error('Login recusado: ' + err); }
  if(!code) return 'none';

  const verifier = localStorage.getItem(VER_KEY);
  clean();
  if(!verifier) throw new Error('Sessão de login perdida. Tente novamente.');

  const r = await fetch(TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code, redirect_uri: redirectUri(),
      client_id: clientId, code_verifier: verifier
    })
  });
  const { data: j, text, notJson } = await readBody(r);
  if(notJson) throw notJsonError(r, text);
  if(!r.ok) throw new Error((j?.error_description || 'Falha ao autenticar.') + raw(r.status, j?.error, ''));
  store(j);
  return 'ok';
}

function clean(){
  localStorage.removeItem(VER_KEY);
  history.replaceState({}, '', redirectUri());
}

function store(j){
  auth.token   = j.access_token;
  auth.expires = Date.now() + (j.expires_in - 60) * 1000;
  if(j.refresh_token) auth.refresh = j.refresh_token;
  localStorage.setItem(TOK_KEY, JSON.stringify(auth));
}

export function restore(){
  try{
    const s = JSON.parse(localStorage.getItem(TOK_KEY) || 'null');
    if(s){ Object.assign(auth, s); return true; }
  }catch(e){}
  return false;
}

export function logout(){
  auth.token = null; auth.expires = 0; auth.refresh = null;
  localStorage.removeItem(TOK_KEY);
}

export const connected = () => !!auth.refresh || (!!auth.token && Date.now() < auth.expires);

async function ensureToken(clientId){
  if(auth.token && Date.now() < auth.expires) return auth.token;
  if(!auth.refresh) throw new Error('Não conectado ao Spotify.');
  const r = await fetch(TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: auth.refresh, client_id: clientId })
  });
  const { data: j, text, notJson } = await readBody(r);
  if(notJson) throw notJsonError(r, text);          // rede no caminho: não descarta a sessão
  if(!r.ok){ logout(); throw new Error('Sessão do Spotify expirou. Conecte novamente.' + raw(r.status, j?.error_description, j?.error)); }
  store(j);
  return auth.token;
}

/* ── Chamadas à API ───────────────────────── */

export class SpotifyError extends Error{
  constructor(msg, code){ super(msg); this.code = code; }
}

/** Texto cru do Spotify, anexado à explicação. Sem isto, um palpite
    errado meu esconde a causa real e não há como diagnosticar. */
const raw = (status, msg, reason) =>
  `\n\n[Spotify ${status}${reason ? ' · ' + reason : ''}${msg ? ': ' + msg : ''}]`;

/** Lê o corpo da resposta sem nunca estourar.
    Nem toda resposta é JSON: portal de wi-fi, filtro de rede ou uma
    página de erro chegam como texto, e antes isso virava um
    "JSON Parse error" que escondia a causa verdadeira. */
async function readBody(r){
  const text = await r.text();
  if(!text) return { data: null, text: '' };
  try{ return { data: JSON.parse(text), text }; }
  catch(e){ return { data: null, text, notJson: true }; }
}

/** Quando a resposta não é JSON, o problema é a rede, não o Spotify. */
function notJsonError(r, text){
  const trecho = text.replace(/\s+/g, ' ').trim().slice(0, 140);
  let host = '';
  try{ host = ' de ' + new URL(r.url).host; }catch(e){ /* resposta sem URL */ }
  return new SpotifyError(
    'A resposta não veio do Spotify. Isso costuma ser a rede no caminho: ' +
    'wi-fi com portal de login, filtro de conteúdo ou VPN/Private Relay. ' +
    'Tente pelos dados móveis ou em outra rede.' +
    `\n\n[resposta ${r.status}${host}: "${trecho}"]`,
    'NOT_JSON');
}

async function call(clientId, path, { method = 'GET', body, query } = {}){
  const token = await ensureToken(clientId);
  const url = new URL(API + path);
  if(query) for(const [k, v] of Object.entries(query)) url.searchParams.set(k, v);

  const r = await fetch(url, {
    method,
    headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });

  if(r.status === 204) return null;
  const { data, text, notJson } = await readBody(r);

  if(!r.ok){
    // Erro do Spotify pode vir como texto puro; nesse caso o próprio
    // texto é a mensagem — não é sinal de rede intrometida.
    const reason = data?.error?.reason;
    const msg = data?.error?.message || (notJson ? text.replace(/\s+/g,' ').trim().slice(0, 200) : '') || 'Erro do Spotify';

    if(r.status === 403 && /may not be registered|not registered/i.test(msg))
      throw new SpotifyError(
        'Sua conta do Spotify não está na lista de autorizados deste app. ' +
        'Apps novos nascem em "Development Mode" e só aceitam contas cadastradas à mão.\n\n' +
        'Como resolver: developer.spotify.com/dashboard → seu app → Settings → ' +
        'User Management → adicione o seu nome e o e-mail da conta Spotify que você usa no iPad → ' +
        'Add user. Depois volte aqui e faça Desconectar e Conectar de novo.' +
        raw(r.status, msg, reason), 'NOT_REGISTERED');
    const isPlayer = path.startsWith('/me/player');
    if(reason === 'NO_ACTIVE_DEVICE' || (r.status === 404 && isPlayer))
      throw new SpotifyError('Nenhum aparelho ativo. Abra o app do Spotify no iPad e toque qualquer coisa por 1 segundo.', 'NO_DEVICE');
    if(r.status === 404)
      throw new SpotifyError(
        'O Spotify não encontrou este item. Playlists geradas por ele — Descobertas da Semana, ' +
        'Daily Mix, Rádio, as "Feitas para você" e as editoriais do próprio Spotify — não podem ser ' +
        'lidas por aplicativos. Só funcionam playlists criadas por você.' +
        raw(r.status, msg, reason), 'NOT_FOUND');
    if(r.status === 403 && /premium/i.test(msg + reason))
      throw new SpotifyError('O controle remoto do Spotify exige conta Premium.', 'PREMIUM');
    if(r.status === 403)
      throw new SpotifyError(
        'O Spotify recusou o acesso (403). Quase sempre é uma destas duas: ' +
        '(1) o app no developer.spotify.com está em Development Mode e a conta com que você entrou aqui ' +
        'não é a mesma que criou o app — entre com a conta dona, ou adicione a sua em User Management; ' +
        '(2) o app não está com "Web API" marcado em Settings → Edit.' +
        raw(r.status, msg, reason), 'FORBIDDEN');
    if(r.status === 429)
      throw new SpotifyError('Muitos comandos seguidos. Aguarde alguns segundos.', 'RATE');
    throw new SpotifyError(msg + raw(r.status, msg, reason), String(r.status));
  }

  // Resposta com sucesso mas ilegível: aí sim é alguém no meio do caminho.
  if(notJson) throw notJsonError(r, text);
  return data;
}

/** Quem está logado. Serve de teste real da conexão: se isto passa,
    o token vale e a API responde de verdade. */
export const me = cid => call(cid, '/me');

export const playbackState = cid => call(cid, '/me/player');
export const devices       = cid => call(cid, '/me/player/devices');

export const transferTo = (cid, deviceId, play = false) =>
  call(cid, '/me/player', { method: 'PUT', body: { device_ids: [deviceId], play } });

export const playTrack = (cid, trackId, deviceId) =>
  call(cid, '/me/player/play', { method: 'PUT', body: { uris: [uri('track', trackId)] }, query: deviceId ? { device_id: deviceId } : undefined });

export const resume  = cid => call(cid, '/me/player/play',  { method: 'PUT' });
export const pause   = cid => call(cid, '/me/player/pause', { method: 'PUT' });
export const next    = cid => call(cid, '/me/player/next',     { method: 'POST' });
export const prev    = cid => call(cid, '/me/player/previous', { method: 'POST' });

export const setVolume = (cid, percent) =>
  call(cid, '/me/player/volume', { method: 'PUT', query: { volume_percent: Math.round(percent) } });

/** Enfileira as próximas peças para o crossfade nativo do Spotify agir. */
export const queue = (cid, trackId) =>
  call(cid, '/me/player/queue', { method: 'POST', query: { uri: uri('track', trackId) } });

/** Playlist inteira, paginada. onPage recebe (carregadas, total). */
export async function playlistTracks(cid, playlistId, onPage){
  const out = [];
  let offset = 0, total = null;
  do{
    const page = await call(cid, `/playlists/${playlistId}/tracks`, {
      query: { limit: 50, offset, fields: 'total,items(track(id,name,duration_ms,artists(name),album(images)))' }
    });
    total = page.total;
    for(const it of page.items || []){
      const t = it.track;
      if(!t || !t.id) continue;                       // faixas locais/indisponíveis
      out.push({
        spotifyId: t.id,
        spotifyUrl: webUrl('track', t.id),
        title: t.name,
        artist: (t.artists || []).map(a => a.name).join(', '),
        durationMs: t.duration_ms || 0,
        artwork: t.album?.images?.at(-1)?.url || ''
      });
    }
    offset += 50;
    onPage?.(out.length, total);
  }while(offset < total);
  return out;
}

export const playlistInfo = (cid, id) => call(cid, `/playlists/${id}`, { query: { fields: 'name,images,tracks(total)' } });
