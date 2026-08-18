/* Monta roteiro.json a partir de roteiro-fonte.txt.
   Os títulos vêm do oEmbed público do Spotify, o mesmo que o app usa —
   sem login e sem depender da Web API, que está barrada nesta conta. */

import { readFile, writeFile } from 'node:fs/promises';

const FONTE  = new URL('../roteiro-fonte.txt', import.meta.url);
const DESTINO = new URL('../roteiro.json', import.meta.url);
const LOJA = 'A∴R∴L∴S∴ Colunas de Pedras Grandes';

let n = 0;
const uid = () => 'r' + (++n).toString(36).padStart(4, '0');

const idDoLink = s => (s.match(/track[/:]([A-Za-z0-9]{22})/) || [])[1] || null;

async function titulo(id){
  const url = `https://open.spotify.com/oembed?url=https://open.spotify.com/track/${id}`;
  try{
    const r = await fetch(url);
    if(!r.ok) return null;
    const j = await r.json();
    return { title: j.title || '', artwork: j.thumbnail_url || '' };
  }catch(e){ return null; }
}

const linhas = (await readFile(FONTE, 'utf8'))
  .split('\n')
  .map(l => l.trim())
  .filter(l => l && !l.startsWith('#'));

const moments = [];
const tracks = {};

for(const linha of linhas){
  const [nomeMomento, link, nota] = linha.split('::').map(x => (x || '').trim());
  let m = moments.find(x => x.name.toLowerCase() === nomeMomento.toLowerCase());
  if(!m){ m = { id: uid(), name: nomeMomento, trackIds: [] }; moments.push(m); }

  // Momento sem link entra vazio: há passos do ritual sem música, e a
  // ordem do roteiro só faz sentido se eles aparecerem no lugar deles.
  if(!link){ console.log(`  ${m.name}  ←  (sem música)`); continue; }

  const trackId = idDoLink(link);
  if(!trackId){ console.warn('  ! link inválido, pulando:', linha); continue; }

  const info = await titulo(trackId);
  const id = uid();
  tracks[id] = {
    id,
    title: info?.title || 'Sem título',
    artist: '',
    note: nota || '',
    spotifyId: trackId,
    spotifyUrl: `https://open.spotify.com/track/${trackId}`,
    artwork: info?.artwork || '',
    fileKey: '', fileName: '', durationMs: 0
  };
  m.trackIds.push(id);
  console.log(`  ${m.name}  ←  ${tracks[id].title}`);
}

await writeFile(DESTINO, JSON.stringify({ version: 1, lodge: LOJA, moments, tracks }, null, 2) + '\n');
console.log(`\n${Object.keys(tracks).length} peça(s) em ${moments.length} momento(s) → roteiro.json`);
