/* ============================================================
   audio.js — mesa de som de dois canais

   Por que Web Audio e não só <audio>: no iPadOS a propriedade
   .volume de um elemento de áudio é somente leitura (o volume é
   do aparelho). Um GainNode por deck é a única forma de ter
   volume independente por faixa — que é o ponto do app.

   Os elementos <audio> continuam sendo a fonte (streaming, sem
   carregar a música inteira na memória do iPad).
   ============================================================ */

let ctx = null;
let master = null;

export const decks = { A: null, B: null };

/* O iPadOS só libera o áudio dentro de um gesto do usuário.
   Chamado no primeiro toque em qualquer lugar. */
export function unlock(){
  if(!ctx){
    // Sem isto, o iPadOS trata o som como "ambiente" e o modo
    // silencioso do iPad emudece os decks — enquanto o Spotify, sendo
    // app nativo, continua tocando. Declarar "playback" põe o app na
    // mesma categoria de um tocador de música.
    try{ if(navigator.audioSession) navigator.audioSession.type = 'playback'; }
    catch(e){ /* versões antigas não têm */ }

    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    for(const id of ['A','B']) decks[id] = makeDeck(id);
  }
  if(ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/** Estado do motor de áudio, para a interface poder avisar o operador. */
export const estado = () => ctx ? ctx.state : 'sem contexto';

/* Ao voltar para o app, o iPadOS costuma deixar o contexto suspenso.
   Sem retomar aqui, o próximo ▶ não produz som nenhum. */
document.addEventListener('visibilitychange', () => {
  if(!document.hidden && ctx && ctx.state === 'suspended') ctx.resume();
});

export const ready = () => !!ctx;

function makeDeck(id){
  const el = new Audio();
  el.preload = 'auto';
  el.crossOrigin = 'anonymous';
  el.playsInline = true;

  const gain = ctx.createGain();
  gain.gain.value = 0.8;
  gain.connect(master);

  const src = ctx.createMediaElementSource(el);
  src.connect(gain);

  return {
    id, el, gain,
    level: 0.8,          // posição do fader (independe do fade em curso)
    trackId: null,
    title: '',
    objectUrl: null,
    fading: null
  };
}

/* ── Carregar / descarregar ───────────────── */

export async function loadBlob(deckId, blob, { title = '', trackId = null } = {}){
  unlock();
  const d = decks[deckId];
  eject(deckId);
  d.objectUrl = URL.createObjectURL(blob);
  d.el.src = d.objectUrl;
  d.title = title;
  d.trackId = trackId;
  d.el.load();
  await new Promise(res => {
    const done = () => { d.el.removeEventListener('loadedmetadata', done); res(); };
    d.el.addEventListener('loadedmetadata', done);
    setTimeout(done, 4000);   // não trava a interface se os metadados demorarem
  });
  return d;
}

export function eject(deckId){
  const d = decks[deckId]; if(!d) return;
  try{ d.el.pause(); }catch(e){}
  d.el.removeAttribute('src');
  try{ d.el.load(); }catch(e){}
  if(d.objectUrl){ URL.revokeObjectURL(d.objectUrl); d.objectUrl = null; }
  d.title = ''; d.trackId = null;
  cancelFade(d);
  setLevel(deckId, d.level);
}

export const isLoaded = deckId => !!(decks[deckId] && decks[deckId].objectUrl);
export const isPlaying = deckId => { const d = decks[deckId]; return !!(d && d.objectUrl && !d.el.paused); };

/* ── Transporte ───────────────────────────── */

export async function play(deckId){
  unlock();
  const d = decks[deckId];
  if(!d.objectUrl) return false;
  // Espera o contexto voltar de fato: tocar com ele suspenso dá silêncio.
  if(ctx.state !== 'running'){
    try{ await ctx.resume(); }catch(e){ /* segue e tenta tocar */ }
  }
  try{ await d.el.play(); return true; }
  catch(e){ console.warn('play bloqueado', e); return false; }
}

export function pause(deckId){ const d = decks[deckId]; if(d?.objectUrl) d.el.pause(); }

export async function toggle(deckId){
  return isPlaying(deckId) ? (pause(deckId), false) : await play(deckId);
}

export function stop(deckId){
  const d = decks[deckId]; if(!d?.objectUrl) return;
  d.el.pause(); d.el.currentTime = 0;
  cancelFade(d); applyGain(d, d.level);
}

export function seekRatio(deckId, ratio){
  const d = decks[deckId];
  if(d?.objectUrl && isFinite(d.el.duration)) d.el.currentTime = d.el.duration * ratio;
}

export function times(deckId){
  const d = decks[deckId];
  if(!d?.objectUrl) return { cur: 0, dur: 0, ratio: 0 };
  const dur = isFinite(d.el.duration) ? d.el.duration : 0;
  const cur = d.el.currentTime || 0;
  return { cur, dur, ratio: dur ? cur / dur : 0 };
}

export function onEnded(fn){
  for(const id of ['A','B']) decks[id]?.el.addEventListener('ended', () => fn(id));
}

/* ── Volume ───────────────────────────────── */

/* Fader percebido: uma curva quadrática soa muito mais natural
   ao ouvido do que ganho linear. */
const curve = v => Math.pow(Math.max(0, Math.min(1, v)), 2);

function applyGain(d, level, seconds = 0.05){
  const g = curve(level);
  const t = ctx.currentTime;
  d.gain.gain.cancelScheduledValues(t);
  d.gain.gain.setValueAtTime(d.gain.gain.value, t);
  d.gain.gain.linearRampToValueAtTime(g, t + seconds);
}

/* level de 0 a 1. Alvo 'M' é o volume mestre. */
export function setLevel(target, level){
  unlock();
  if(target === 'M'){
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(curve(level), t + 0.05);
    return;
  }
  const d = decks[target]; if(!d) return;
  d.level = level;
  cancelFade(d);
  applyGain(d, level);
}

function cancelFade(d){
  if(d?.fading){ clearTimeout(d.fading.timer); d.fading = null; }
}

/* Fade de entrada: começa em zero, toca e sobe até o fader.
   Se o deck já estiver no ar, sobe a partir de onde está — assim
   pedir a transição duas vezes não dá um tranco no som. */
export async function fadeIn(deckId, seconds){
  unlock();
  const d = decks[deckId];
  if(!d.objectUrl) return false;
  const alreadyLive = !d.el.paused;
  cancelFade(d);
  const t = ctx.currentTime;
  const from = alreadyLive ? d.gain.gain.value : 0.0001;
  d.gain.gain.cancelScheduledValues(t);
  d.gain.gain.setValueAtTime(from, t);
  const ok = await play(deckId);
  if(!ok) return false;
  d.gain.gain.linearRampToValueAtTime(curve(d.level), ctx.currentTime + seconds);
  return true;
}

/* Fade de saída: desce até zero e pausa, mantendo a posição do fader. */
export function fadeOut(deckId, seconds, { stopAtEnd = true } = {}){
  unlock();
  const d = decks[deckId];
  if(!d.objectUrl) return;
  cancelFade(d);
  const t = ctx.currentTime;
  d.gain.gain.cancelScheduledValues(t);
  d.gain.gain.setValueAtTime(d.gain.gain.value, t);
  d.gain.gain.linearRampToValueAtTime(0.0001, t + seconds);
  const timer = setTimeout(() => {
    if(stopAtEnd){ d.el.pause(); d.el.currentTime = 0; }
    applyGain(d, d.level, 0.02);
    d.fading = null;
  }, seconds * 1000 + 60);
  d.fading = { timer };
}

/* Transição cruzada: o que está tocando sai enquanto o outro entra.
   É exatamente o "soltar a próxima um pouquinho antes". */
export async function crossfade(seconds){
  unlock();
  const aLive = isPlaying('A'), bLive = isPlaying('B');
  let from, to;
  if(aLive && !bLive)      { from = 'A'; to = 'B'; }
  else if(bLive && !aLive) { from = 'B'; to = 'A'; }
  else if(aLive && bLive)  { from = 'A'; to = 'B'; }   // ambos tocando: A cede a vez
  else                     { from = null; to = isLoaded('A') ? 'A' : 'B'; }

  if(to && isLoaded(to)) await fadeIn(to, seconds);
  if(from) fadeOut(from, seconds);
  return { from, to };
}

/** Toca um tom curto pelo mesmo caminho dos decks (gain → mestre →
    saída). Se este tom não sai, o problema é o motor de áudio ou o
    volume do iPad, não o arquivo. */
export async function testeDeSom(){
  unlock();
  if(ctx.state !== 'running'){
    try{ await ctx.resume(); }catch(e){}
  }
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = 440;
  g.gain.setValueAtTime(0.0001, ctx.currentTime);
  g.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.05);
  g.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 1.1);
  osc.connect(g); g.connect(master);
  osc.start();
  osc.stop(ctx.currentTime + 1.2);
  return ctx.state;
}

/* Corta tudo na hora. */
export function panic(){
  if(!ctx) return;
  for(const id of ['A','B']){
    const d = decks[id];
    if(!d?.objectUrl) continue;
    cancelFade(d);
    d.el.pause();
    applyGain(d, d.level, 0.02);
  }
}

/* Mantém a tela do iPad acordada enquanto houver som — sem isso
   o iPad bloqueia no meio da sessão e o áudio para. */
let wakeLock = null;
export async function keepAwake(on){
  try{
    if(on && !wakeLock && navigator.wakeLock){
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }else if(!on && wakeLock){
      await wakeLock.release(); wakeLock = null;
    }
  }catch(e){ /* recusa do sistema não é erro fatal */ }
}
