/* ============================================================
   store.js — estado, persistência e arquivos de áudio
   ============================================================ */

const LS_KEY = 'mh:state:v1';

/* Roteiro padrão de uma sessão. É só um ponto de partida:
   tudo pode ser renomeado, reordenado ou apagado dentro do app. */
const DEFAULT_MOMENTS = [
  'Recepção / Ambiente',
  'Abertura dos Trabalhos',
  'Entrada do Venerável Mestre',
  'Deambulação',
  'Leitura da Prancha',
  'Peça de Arquitetura',
  'Iniciação / Elevação / Exaltação',
  'Palavra a Bem da Ordem',
  'Cadeia de União',
  'Encerramento dos Trabalhos',
  'Necrológio',
  'Ágape'
];

const uid = () => 'x' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

function freshState(){
  return {
    version: 1,
    lodge: 'A∴R∴L∴S∴ Colunas de Pedras Grandes',
    moments: DEFAULT_MOMENTS.map(name => ({ id: uid(), name, trackIds: [] })),
    tracks: {},
    settings: {
      clientId: '',
      openInApp: true,      // usa o esquema spotify: em vez do link https
      fadeSeconds: 5,
      volumes: { A: 80, B: 80, M: 90, S: 70 }
    },
    selectedMomentId: null
  };
}

export const state = load();

function load(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(!raw) return freshState();
    const s = JSON.parse(raw);
    const base = freshState();
    // mescla defeituosos/ausentes sem perder o que o usuário já tem
    s.settings = Object.assign(base.settings, s.settings || {});
    s.settings.volumes = Object.assign(base.settings.volumes, s.settings.volumes || {});
    s.moments = Array.isArray(s.moments) && s.moments.length ? s.moments : base.moments;
    s.tracks  = s.tracks && typeof s.tracks === 'object' ? s.tracks : {};
    s.lodge   = s.lodge || base.lodge;
    return s;
  }catch(e){
    console.warn('Estado ilegível, recomeçando do zero.', e);
    return freshState();
  }
}

let saveTimer = null;
export function save(){
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try{ localStorage.setItem(LS_KEY, JSON.stringify(state)); }
    catch(e){ console.error('Falha ao salvar', e); }
  }, 180);
}

/* ── Momentos ─────────────────────────────── */

export function getMoment(id){ return state.moments.find(m => m.id === id) || null; }

export function selectedMoment(){
  let m = getMoment(state.selectedMomentId);
  if(!m){ m = state.moments[0] || null; state.selectedMomentId = m ? m.id : null; }
  return m;
}

export function addMoment(name){
  const m = { id: uid(), name: name.trim() || 'Novo momento', trackIds: [] };
  state.moments.push(m); save(); return m;
}

export function renameMoment(id, name){
  const m = getMoment(id); if(!m) return;
  m.name = name.trim() || m.name; save();
}

/* Apaga o momento. As peças só somem de vez se não estiverem em nenhum outro. */
export function removeMoment(id){
  const m = getMoment(id); if(!m) return;
  state.moments = state.moments.filter(x => x.id !== id);
  for(const tid of m.trackIds){
    const usedElsewhere = state.moments.some(x => x.trackIds.includes(tid));
    if(!usedElsewhere) delete state.tracks[tid];
  }
  if(state.selectedMomentId === id) state.selectedMomentId = state.moments[0]?.id || null;
  save();
}

export function moveMoment(id, dir){
  const i = state.moments.findIndex(m => m.id === id);
  const j = i + dir;
  if(i < 0 || j < 0 || j >= state.moments.length) return;
  [state.moments[i], state.moments[j]] = [state.moments[j], state.moments[i]];
  save();
}

/* ── Peças ────────────────────────────────── */

export function addTrack(momentId, data){
  const t = Object.assign({
    id: uid(),
    title: 'Sem título',
    artist: '',
    note: '',
    spotifyId: '',      // id da faixa
    spotifyUrl: '',
    artwork: '',
    fileKey: '',        // chave no IndexedDB, quando houver arquivo local
    fileName: '',
    durationMs: 0
  }, data);
  state.tracks[t.id] = t;
  const m = getMoment(momentId);
  if(m) m.trackIds.push(t.id);
  save();
  return t;
}

export function updateTrack(id, patch){
  const t = state.tracks[id]; if(!t) return null;
  Object.assign(t, patch); save(); return t;
}

export async function removeTrack(momentId, trackId){
  const m = getMoment(momentId);
  if(m) m.trackIds = m.trackIds.filter(x => x !== trackId);
  const stillUsed = state.moments.some(x => x.trackIds.includes(trackId));
  if(!stillUsed){
    const t = state.tracks[trackId];
    if(t?.fileKey) await deleteFile(t.fileKey).catch(()=>{});
    delete state.tracks[trackId];
  }
  save();
}

/** Em qual momento esta peça está. */
export function momentOf(trackId){
  return state.moments.find(m => m.trackIds.includes(trackId)) || null;
}

/** Passa a peça de um momento para outro, preservando tudo o mais. */
export function moveTrackToMoment(trackId, toMomentId){
  const from = momentOf(trackId);
  const to = getMoment(toMomentId);
  if(!from || !to || from.id === to.id) return false;
  from.trackIds = from.trackIds.filter(x => x !== trackId);
  if(!to.trackIds.includes(trackId)) to.trackIds.push(trackId);
  save();
  return true;
}

export function moveTrack(momentId, trackId, dir){
  const m = getMoment(momentId); if(!m) return;
  const i = m.trackIds.indexOf(trackId);
  const j = i + dir;
  if(i < 0 || j < 0 || j >= m.trackIds.length) return;
  [m.trackIds[i], m.trackIds[j]] = [m.trackIds[j], m.trackIds[i]];
  save();
}

export function searchTracks(q){
  const s = q.trim().toLowerCase();
  if(!s) return [];
  return Object.values(state.tracks).filter(t =>
    (t.title + ' ' + t.artist + ' ' + t.note).toLowerCase().includes(s)
  );
}

/* ── Arquivos de áudio (IndexedDB) ─────────── */

let dbPromise = null;
function db(){
  if(dbPromise) return dbPromise;
  dbPromise = new Promise((res, rej) => {
    const req = indexedDB.open('mh-audio', 1);
    req.onupgradeneeded = () => {
      if(!req.result.objectStoreNames.contains('files')) req.result.createObjectStore('files');
    };
    req.onsuccess = () => res(req.result);
    req.onerror   = () => rej(req.error);
  });
  return dbPromise;
}

function tx(mode, fn){
  return db().then(d => new Promise((res, rej) => {
    const t = d.transaction('files', mode);
    const req = fn(t.objectStore('files'));
    req.onsuccess = () => res(req.result);
    req.onerror   = () => rej(req.error);
  }));
}

export async function putFile(blob){
  const key = 'f' + uid();
  await tx('readwrite', st => st.put(blob, key));
  return key;
}
export function getFile(key){ return tx('readonly',  st => st.get(key)); }
export function deleteFile(key){ return tx('readwrite', st => st.delete(key)); }

/* Pede ao iPadOS para não descartar os dados do app. Sem isso, o
   sistema pode limpar tudo para liberar espaço — levando junto o
   roteiro, os arquivos de áudio e a sessão do Spotify. */
export async function persistir(){
  if(!navigator.storage?.persist) return null;
  try{
    if(await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  }catch(e){ return null; }
}

export async function ehPersistente(){
  try{ return await navigator.storage?.persisted?.() ?? null; }
  catch(e){ return null; }
}

export async function storageInfo(){
  if(!navigator.storage?.estimate) return null;
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  return { usage, quota };
}

/* ── Backup ───────────────────────────────── */

export function exportJSON(){
  const copy = JSON.parse(JSON.stringify(state));
  delete copy.selectedMomentId;
  if(copy.settings) copy.settings = { ...copy.settings, clientId: state.settings.clientId };
  return JSON.stringify(copy, null, 2);
}

/** merge = true soma ao roteiro atual, casando momentos pelo nome e
    pulando peças que já existem. Sem isso, receber um roteiro pronto
    apagaria o que o operador já tinha montado à mão. */
export function importJSON(text, { merge = false } = {}){
  const incoming = JSON.parse(text);
  if(!incoming.moments || !incoming.tracks) throw new Error('Arquivo fora do formato esperado.');

  if(merge){
    let novos = 0;
    for(const im of incoming.moments){
      const nome = (im.name || '').trim();
      let alvo = state.moments.find(m => m.name.trim().toLowerCase() === nome.toLowerCase());
      if(!alvo) alvo = addMoment(nome);
      const jaTem = new Set(alvo.trackIds.map(id => state.tracks[id]?.spotifyId).filter(Boolean));
      for(const tid of im.trackIds || []){
        const t = incoming.tracks[tid];
        if(!t) continue;
        if(t.spotifyId && jaTem.has(t.spotifyId)) continue;
        const copia = { ...t };
        delete copia.id;                       // id novo: não colidir com o que existe
        copia.fileKey = ''; copia.fileName = '';
        addTrack(alvo.id, copia);
        if(t.spotifyId) jaTem.add(t.spotifyId);
        novos++;
      }
    }
    save();
    return novos;
  }

  state.lodge   = incoming.lodge || state.lodge;
  state.moments = incoming.moments;
  state.tracks  = incoming.tracks;
  if(incoming.settings) state.settings = Object.assign(state.settings, incoming.settings);
  // arquivos locais não viajam no JSON: marca as peças que perderam o áudio
  for(const t of Object.values(state.tracks)){
    if(t.fileKey) { t.fileKey = ''; t.fileName = ''; }
  }
  state.selectedMomentId = state.moments[0]?.id || null;
  save();
  return Object.keys(state.tracks).length;
}
