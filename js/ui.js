/* ============================================================
   ui.js — peças de interface reutilizáveis
   ============================================================ */

export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(tag, props = {}, ...kids){
  const n = document.createElement(tag);
  for(const [k, v] of Object.entries(props)){
    if(k === 'class') n.className = v;
    else if(k === 'html') n.innerHTML = v;
    else if(k.startsWith('on')) n.addEventListener(k.slice(2).toLowerCase(), v);
    else if(v !== null && v !== undefined && v !== false) n.setAttribute(k, v);
  }
  for(const k of kids.flat()){
    if(k === null || k === undefined || k === false) continue;
    n.append(k.nodeType ? k : document.createTextNode(String(k)));
  }
  return n;
}

export function mmss(seconds){
  if(!isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60), s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2,'0')}`;
}

/* ── Aviso flutuante ──────────────────────── */

let toastTimer = null;
export function toast(msg, isError = false){
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast' + (isError ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), isError ? 5200 : 2600);
}

/* ── Diálogo ──────────────────────────────── */

let onCloseHook = null;

/** buttons: [{ label, kind:'primary'|'ghost'|'danger', onClick(close) }] */
export function modal({ title, body, buttons = [], onClose = null }){
  const root = $('#modalRoot');
  $('#modalTitle').textContent = title;

  const b = $('#modalBody');
  b.innerHTML = '';
  b.append(typeof body === 'string' ? el('div', { class:'help', html: body }) : body);

  const f = $('#modalFoot');
  f.innerHTML = '';
  for(const btn of buttons){
    const cls = btn.kind === 'primary' ? 'primary-btn'
              : btn.kind === 'danger'  ? 'ghost-btn danger-btn' : 'ghost-btn';
    f.append(el('button', { class: cls, onclick: () => btn.onClick?.(closeModal) }, btn.label));
  }

  onCloseHook = onClose;
  root.classList.remove('hidden');
  setTimeout(() => b.querySelector('input,textarea,select')?.focus(), 60);
  return closeModal;
}

export function closeModal(){
  $('#modalRoot').classList.add('hidden');
  const hook = onCloseHook; onCloseHook = null;
  hook?.();
}

export function initModal(){
  $$('#modalRoot [data-close]').forEach(n => n.addEventListener('click', closeModal));
}

export function field(label, input, hint){
  return el('div', { class:'field' },
    el('label', {}, label),
    input,
    hint ? el('p', { class:'hint', html: hint }) : null
  );
}

export function input(attrs = {}){ return el('input', { type:'text', ...attrs }); }

/* ── Fader vertical ───────────────────────────
   O <input type=range> vertical é irregular no iPadOS; este é um
   controle próprio, com área de toque grande e resposta imediata.
   ─────────────────────────────────────────── */

export function makeFader(node, { value = 0.8, onChange }){
  const track = $('.fader-track', node);
  const fill  = $('.fader-fill',  node);
  const knob  = $('.fader-knob',  node);
  const val   = $('.fader-val',   node);
  let v = value;

  function paint(){
    const pct = (v * 100).toFixed(1) + '%';
    fill.style.height = pct;
    knob.style.bottom = `calc(${pct} - 11px)`;
    val.textContent = Math.round(v * 100);
    node.classList.toggle('muted', v < 0.02);
  }

  function fromEvent(e){
    const r = track.getBoundingClientRect();
    const y = (e.touches ? e.touches[0].clientY : e.clientY);
    const nv = 1 - (y - r.top) / r.height;
    v = Math.max(0, Math.min(1, nv));
    paint();
    onChange?.(v);
  }

  let dragging = false;
  const down = e => { dragging = true; track.setPointerCapture?.(e.pointerId); fromEvent(e); e.preventDefault(); };
  const move = e => { if(dragging){ fromEvent(e); e.preventDefault(); } };
  const up   = () => { dragging = false; };

  track.addEventListener('pointerdown', down);
  track.addEventListener('pointermove', move);
  track.addEventListener('pointerup', up);
  track.addEventListener('pointercancel', up);

  paint();

  return {
    get value(){ return v; },
    set(nv, silent = false){ v = Math.max(0, Math.min(1, nv)); paint(); if(!silent) onChange?.(v); },
    enable(on){ node.style.opacity = on ? '1' : '.4'; track.style.pointerEvents = on ? 'auto' : 'none'; }
  };
}
