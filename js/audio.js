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

/* Categoria de áudio e por que ela precisa de cuidado:

   "playback" é o que faz os decks tocarem com o iPad no silencioso —
   sem isso ficam mudos. Mas no iPadOS ela NÃO é mixável: ativá-la
   interrompe o som dos outros aplicativos. Se o app assumir essa
   categoria só por voltar ao primeiro plano, ele pausa o Spotify sem
   ter nada para tocar.

   Por isso a separação abaixo: criar o motor é inofensivo e pode
   acontecer a qualquer momento; ATIVAR só quando um deck vai mesmo
   soar, e devolver a sessão assim que os dois silenciam.
   ─────────────────────────────────────────── */

function sessao(tipo){
  try{ if(navigator.audioSession) navigator.audioSession.type = tipo; }
  catch(e){ /* versões antigas não têm */ }
}

/** Cria o motor sem ativá-lo. Não toma o áudio de ninguém. */
export function garantirContexto(){
  if(!ctx){
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    for(const id of ['A','B']) decks[id] = makeDeck(id);
    sessao('auto');          // explícito: nasce mixável, dividindo o áudio
  }
  return ctx;
}

/** Assume o áudio do aparelho. Só quando um deck vai tocar. */
export async function ativar(){
  garantirContexto();
  sessao('playback');
  if(ctx.state !== 'running'){
    try{ await ctx.resume(); }catch(e){ /* segue e tenta tocar */ }
  }
  return ctx;
}

/* Compatibilidade: quem só precisa do motor existindo. */
export const unlock = garantirContexto;

/** Devolve o áudio ao sistema quando os dois decks estão calados —
    é o que deixa o Spotify seguir tocando por cima do painel. */
let timerLiberar = null;
export function liberarSeCalado(){
  clearTimeout(timerLiberar);
  timerLiberar = setTimeout(() => {
    if(!ctx || isPlaying('A') || isPlaying('B')) return;
    sessao('auto');
    if(ctx.state === 'running') ctx.suspend().catch(() => {});
  }, 400);   // margem para transições, em que um deck para e outro entra
}

/* Ao voltar para o app, retoma apenas se havia deck no ar. Retomar à
   toa era o que interrompia a música do Spotify. */
document.addEventListener('visibilitychange', () => {
  if(document.hidden || !ctx) return;
  if(isPlaying('A') || isPlaying('B')) ativar();
});

/** Estado do motor de áudio, para a interface poder avisar o operador. */
export const estado = () => ctx ? ctx.state : 'sem contexto';

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
  garantirContexto();
  const d = decks[deckId];
  if(!d.objectUrl) return false;
  await ativar();                 // só aqui o app toma o áudio do aparelho
  try{ await d.el.play(); return true; }
  catch(e){ console.warn('play bloqueado', e); return false; }
}

export function pause(deckId){
  const d = decks[deckId];
  if(d?.objectUrl){ d.el.pause(); liberarSeCalado(); }
}

export async function toggle(deckId){
  return isPlaying(deckId) ? (pause(deckId), false) : await play(deckId);
}

export function stop(deckId){
  const d = decks[deckId]; if(!d?.objectUrl) return;
  d.el.pause(); d.el.currentTime = 0;
  cancelFade(d); applyGain(d, d.level);
  liberarSeCalado();
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
    liberarSeCalado();
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
  await ativar();
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
  setTimeout(liberarSeCalado, 1400);
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
  liberarSeCalado();
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
