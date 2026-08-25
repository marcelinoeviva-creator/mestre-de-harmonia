/* ============================================================
   app.js — montagem e comportamento do painel
   ============================================================ */

import * as S from './store.js';
import * as A from './audio.js';
import * as SP from './spotify.js';
import { $, $$, el, mmss, toast, modal, closeModal, initModal, field, input, makeFader } from './ui.js';

const st = S.state;
const faders = {};
let searching = '';
let spState = null;          // último estado de reprodução do Spotify
let spDeviceId = null;
let volTimer = null;

/* ═══════════ Início ═══════════ */

async function boot(){
  initModal();
  buildFaders();
  wireHeader();
  wireConsole();
  wireLists();
  renderAll();

  document.addEventListener('pointerdown', () => { A.unlock(); S.persistir(); }, { once: true });
  S.persistir();

  A.onEnded(id => { paintDeck(id); paintTracks(); });
  setInterval(tick, 250);

  await initSpotify();
  registerSW();
}

function registerSW(){
  if(!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW não registrado', e));
}

/* ═══════════ Faders ═══════════ */

function buildFaders(){
  const v = st.settings.volumes;
  for(const target of ['A','B','M','S']){
    const node = $(`.fader[data-target="${target}"]`);
    if(!node) continue;
    faders[target] = makeFader(node, {
      value: (v[target] ?? 80) / 100,
      onChange: nv => {
        v[target] = Math.round(nv * 100);
        S.save();
        if(target === 'S') pushSpotifyVolume(v[target]);
        else A.setLevel(target, nv);
      }
    });
  }
  faders.S?.enable(false);
}

function pushSpotifyVolume(percent){
  if(!SP.connected()) return;
  clearTimeout(volTimer);                       // a API do Spotify limita comandos seguidos
  volTimer = setTimeout(() => {
    SP.setVolume(st.settings.clientId, percent).catch(() => {});
  }, 400);
}

/* ═══════════ Cabeçalho ═══════════ */

function wireHeader(){
  $('#lodgeName').textContent = st.lodge;
  $('#lodgeName').onclick = () => {
    const i = input({ value: st.lodge, maxlength: 60 });
    modal({
      title:'Nome da Loja',
      body: field('Como aparece no topo', i),
      buttons:[
        { label:'Cancelar', onClick: c => c() },
        { label:'Salvar', kind:'primary', onClick: c => {
            st.lodge = i.value.trim() || 'A∴R∴L∴S∴ Colunas de Pedras Grandes';
            $('#lodgeName').textContent = st.lodge; S.save(); c();
        }}
      ]
    });
  };

  $('#btnSettings').onclick = openSettings;
  $('#btnSearch').onclick = () => {
    const bar = $('#searchBar');
    bar.classList.toggle('hidden');
    if(!bar.classList.contains('hidden')) $('#searchInput').focus();
    else { searching = ''; $('#searchInput').value = ''; paintTracks(); }
  };
  $('#btnSearchClose').onclick = () => {
    $('#searchBar').classList.add('hidden');
    searching = ''; $('#searchInput').value = ''; paintTracks();
  };
  $('#searchInput').oninput = e => { searching = e.target.value; paintTracks(); };
  $('#spotifyStatus').onclick = () => {
    // Desconectado com Client ID guardado: reconectar é o que se quer,
    // e caçar o botão no fim de Ajustes é atrito à toa.
    if(!SP.connected() && st.settings.clientId){
      return modal({
        title:'Spotify desconectado',
        body:'A sessão anterior se perdeu. Reconectar leva você à tela de autorização do Spotify e volta para cá.',
        buttons:[
          { label:'Ajustes', onClick: c => { c(); openSettings(); } },
          { label:'Reconectar', kind:'primary', onClick: async () => {
              try{ await SP.login(st.settings.clientId); }
              catch(e){ toast(e.message, true); }
          }}
        ]
      });
    }
    openSettings();
  };
}

/* ═══════════ Mesa de som ═══════════ */

function wireConsole(){
  $('#btnConsoleToggle').onclick = () => $('#console').classList.toggle('collapsed');

  $$('.deck-btn[data-act]').forEach(b => {
    b.onclick = async () => {
      const id = b.dataset.deck, act = b.dataset.act;
      if(!A.isLoaded(id)) return toast('Deck ' + id + ' está vazio. Use "→ ' + id + '" numa peça com arquivo.');
      const secs = st.settings.fadeSeconds;
      if(act === 'toggle')       await A.toggle(id);
      else if(act === 'stop')    A.stop(id);
      else if(act === 'fadein')  await A.fadeIn(id, secs);
      else if(act === 'fadeout') A.fadeOut(id, secs);
      else if(act === 'eject')   A.eject(id);
      paintDeck(id); paintTracks();
    };
  });

  $$('input[data-role="scrub"]').forEach(r => {
    r.addEventListener('pointerdown', () => { r.dataset.holding = '1'; });
    const release = () => { delete r.dataset.holding; };
    r.addEventListener('pointerup', release);
    r.addEventListener('pointercancel', release);
    r.addEventListener('input', () => A.seekRatio(r.dataset.deck, r.value / 1000));
  });

  $$('#fadeDur button').forEach(b => {
    b.onclick = () => {
      $$('#fadeDur button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      st.settings.fadeSeconds = Number(b.dataset.v); S.save();
    };
  });
  const cur = $(`#fadeDur button[data-v="${st.settings.fadeSeconds}"]`);
  if(cur){ $$('#fadeDur button').forEach(x => x.classList.remove('on')); cur.classList.add('on'); }

  $('#btnSwap').onclick = async () => {
    if(!A.isLoaded('A') && !A.isLoaded('B')) return toast('Carregue peças nos decks A e B primeiro.');
    const { from, to } = await A.crossfade(st.settings.fadeSeconds);
    toast(from ? `Transição ${from} → ${to} em ${st.settings.fadeSeconds}s` : `Entrando com ${to}`);
    paintDeck('A'); paintDeck('B'); paintTracks();
  };

  $('#btnPanic').onclick = async () => {
    A.panic();
    if(SP.connected()) SP.pause(st.settings.clientId).catch(() => {});
    paintDeck('A'); paintDeck('B'); paintTracks();
    toast('Tudo silenciado.');
  };

  $('#spToggle').onclick = () => spCommand(spState?.is_playing ? 'pause' : 'resume');
  $('#spNext').onclick   = () => spCommand('next');
  $('#spPrev').onclick   = () => spCommand('prev');
  $('#spDevices').onclick = openDevices;

  const spScrub = $('#spScrub');
  spScrub.addEventListener('pointerdown', () => { spScrub.dataset.holding = '1'; });
  const soltar = () => { delete spScrub.dataset.holding; };
  spScrub.addEventListener('pointerup', soltar);
  spScrub.addEventListener('pointercancel', soltar);
  spScrub.addEventListener('change', async () => {
    if(!spCanControl() || !spPos.dur) return;
    const destino = spPos.dur * (spScrub.value / 1000);
    try{
      await SP.seek(st.settings.clientId, destino);
      spPos = { ...spPos, ms: destino, at: Date.now() };
      setTimeout(pollSpotify, 400);
    }catch(e){ toast(e.message, true); }
  });
}

async function spCommand(kind){
  if(!spCanControl()) return toast('Comandar o Spotify daqui exige conexão ativa e conta Premium.');
  const cid = st.settings.clientId;
  try{
    if(kind === 'pause')  await SP.pause(cid);
    if(kind === 'resume') await SP.resume(cid);
    if(kind === 'next')   await SP.next(cid);
    if(kind === 'prev')   await SP.prev(cid);
    setTimeout(pollSpotify, 350);
  }catch(e){ toast(e.message, true); }
}

/* ═══════════ Momentos ═══════════ */

function wireLists(){
  $('#btnAddMoment').onclick = () => {
    const i = input({ placeholder:'Ex.: Sessão Magna' });
    modal({
      title:'Novo momento',
      body: field('Nome do momento', i, 'Um bloco do roteiro da sessão.'),
      buttons:[
        { label:'Cancelar', onClick: c => c() },
        { label:'Criar', kind:'primary', onClick: c => {
            if(!i.value.trim()) return;
            st.selectedMomentId = S.addMoment(i.value).id;
            renderAll(); c();
        }}
      ]
    });
  };
  $('#btnEditMoments').onclick = openOrganize;
  $('#btnAddTrack').onclick = () => openTrackEditor(null);
  $('#btnImportPlaylist').onclick = openImport;
}

function paintMoments(){
  const list = $('#momentList');
  list.innerHTML = '';
  const sel = S.selectedMoment();
  for(const m of st.moments){
    list.append(el('li', {},
      el('button', {
        class: m.id === sel?.id ? 'on' : '',
        onclick: () => { st.selectedMomentId = m.id; S.save(); paintMoments(); paintTracks(); }
      },
        el('span', { class:'moment-name' }, m.name),
        el('span', { class:'moment-count' }, String(m.trackIds.length))
      )
    ));
  }
}

function openOrganize(){
  const box = el('div');
  const draw = () => {
    box.innerHTML = '';
    box.append(el('p', { class:'hint', style:'margin:0 0 12px' },
      '↑ ↓ mudam a ordem do roteiro · ✎ renomeia · 🗑 apaga o momento'));
    st.moments.forEach((m, i) => {
      box.append(el('div', { class:'sortrow' },
        el('span', { class:'grow' }, m.name),
        el('button', { class:'mini-btn', disabled: i === 0, onclick: () => { S.moveMoment(m.id,-1); draw(); paintMoments(); } }, '↑'),
        el('button', { class:'mini-btn', disabled: i === st.moments.length-1, onclick: () => { S.moveMoment(m.id,1); draw(); paintMoments(); } }, '↓'),
        el('button', { class:'mini-btn', onclick: () => {
            const i2 = input({ value: m.name });
            modal({ title:'Renomear', body: field('Nome', i2), buttons:[
              { label:'Cancelar', onClick: c => { c(); openOrganize(); } },
              { label:'Salvar', kind:'primary', onClick: c => { S.renameMoment(m.id, i2.value); c(); paintMoments(); paintTracks(); openOrganize(); } }
            ]});
        }}, '✎'),
        el('button', { class:'mini-btn danger-btn', onclick: () => {
            if(st.moments.length <= 1) return toast('Deixe ao menos um momento.', true);
            modal({ title:'Apagar momento',
              body:`Apagar <strong>${esc(m.name)}</strong> e as peças que só existem nele?`,
              buttons:[
                { label:'Cancelar', onClick: c => { c(); openOrganize(); } },
                { label:'Apagar', kind:'danger', onClick: c => { S.removeMoment(m.id); c(); renderAll(); openOrganize(); } }
              ]});
        }}, '🗑')
      ));
    });
  };
  draw();
  modal({ title:'Organizar momentos', body: box, buttons:[{ label:'Pronto', kind:'primary', onClick: c => c() }] });
}

/* ═══════════ Peças ═══════════ */

function paintTracks(){
  const m = S.selectedMoment();
  const list = $('#trackList');
  list.innerHTML = '';

  let rows, heading, sub;
  if(searching.trim()){
    rows = S.searchTracks(searching);
    heading = 'Busca';
    sub = `${rows.length} peça(s) para "${searching.trim()}"`;
  }else{
    rows = (m?.trackIds || []).map(id => st.tracks[id]).filter(Boolean);
    heading = m?.name || '—';
    sub = rows.length ? `${rows.length} peça(s)` : '';
  }
  $('#momentTitle').textContent = heading;
  $('#momentSub').textContent = sub;
  $('#trackEmpty').classList.toggle('hidden', rows.length > 0);
  $('#btnAddTrack').disabled = !!searching.trim();

  rows.forEach((t, i) => list.append(trackRow(t, m, i, rows.length)));
}

function trackRow(t, moment, i, total){
  const live = (A.decks.A?.trackId === t.id && A.isPlaying('A')) ||
               (A.decks.B?.trackId === t.id && A.isPlaying('B')) ||
               (spState?.item?.id && spState.item.id === t.spotifyId && spState.is_playing);

  const art = el('div', { class:'track-art' });
  if(t.artwork) art.style.backgroundImage = `url(${t.artwork})`;

  const meta = el('div', { class:'track-meta' });
  if(t.artist) meta.append(el('span', {}, t.artist));
  if(t.spotifyId) meta.append(el('span', { class:'badge sp' }, 'Spotify'));
  if(t.fileKey)   meta.append(el('span', { class:'badge local' }, 'Arquivo'));
  if(t.durationMs) meta.append(el('span', {}, mmss(t.durationMs/1000)));
  if(t.note) meta.append(el('span', { class:'track-note' }, '· ' + t.note));

  const actions = el('div', { class:'track-actions' },
    el('button', { class:'act go', title:'Tocar', onclick: () => playTrack(t) }, '▶'),
    el('button', { class:'act cue', title: t.fileKey ? 'Carregar no deck A' : 'Só peças com arquivo vão para os decks',
        disabled: !t.fileKey, onclick: () => cue(t, 'A') }, '→A'),
    el('button', { class:'act cue', title: t.fileKey ? 'Carregar no deck B' : 'Só peças com arquivo vão para os decks',
        disabled: !t.fileKey, onclick: () => cue(t, 'B') }, '→B'),
    el('button', { class:'act', title:'Editar', onclick: () => openTrackEditor(t) }, '✎')
  );
  if(!searching.trim() && moment){
    actions.prepend(
      el('button', { class:'act', title:'Subir', disabled: i === 0,
        onclick: () => { S.moveTrack(moment.id, t.id, -1); paintTracks(); } }, '↑'),
      el('button', { class:'act', title:'Descer', disabled: i === total-1,
        onclick: () => { S.moveTrack(moment.id, t.id, 1); paintTracks(); } }, '↓')
    );
  }

  return el('li', {},
    el('div', { class:'track-row' + (live ? ' playing' : '') },
      art,
      el('div', { class:'track-info' }, el('div', { class:'track-title' }, t.title), meta),
      actions
    )
  );
}

async function playTrack(t){
  if(spCanControl() && t.spotifyId){
    try{
      await SP.playTrack(st.settings.clientId, t.spotifyId, spDeviceId || undefined);
      toast('Tocando: ' + t.title);
      setTimeout(pollSpotify, 500);
      return;
    }catch(e){
      if(e.code === 'NO_DEVICE'){
        toast(e.message, true);
        SP.openExternally('track', t.spotifyId, st.settings.openInApp);
        return;
      }
      toast(e.message, true);
    }
  }
  if(t.spotifyId){
    SP.openExternally('track', t.spotifyId, st.settings.openInApp);
    return;
  }
  if(t.fileKey){ await cue(t, A.isPlaying('A') ? 'B' : 'A', true); return; }
  toast('Esta peça não tem link do Spotify nem arquivo.', true);
}

async function cue(t, deckId, autoplay = false){
  if(!t.fileKey) return toast('Esta peça não tem arquivo de áudio.', true);
  try{
    const blob = await S.getFile(t.fileKey);
    if(!blob) return toast('O arquivo desta peça não está mais no iPad. Reimporte.', true);
    await A.loadBlob(deckId, blob, { title: t.title, trackId: t.id });
    if(autoplay) await A.play(deckId);
    paintDeck(deckId); paintTracks();
    toast(`${t.title} → deck ${deckId}`);
  }catch(e){ toast('Falha ao carregar: ' + e.message, true); }
}

/* ── Editor de peça ───────────────────────── */

/** <select> com todos os momentos, com um deles já marcado. */
function momentSelect(selectedId){
  return el('select', {}, ...st.moments.map(m =>
    el('option', { value: m.id, selected: m.id === selectedId ? '' : null }, m.name)));
}

function openTrackEditor(existing){
  // Ao editar, o momento que vale é o que realmente contém a peça —
  // na busca, o selecionado na lateral pode ser outro.
  const m = (existing && S.momentOf(existing.id)) || S.selectedMoment();
  if(!m) return toast('Crie um momento primeiro.', true);

  const t = existing || {};
  const fMoment = existing ? momentSelect(m.id) : null;
  let pendingFile = null;              // { blob, name }

  const fLink   = input({ value: t.spotifyUrl || '', placeholder:'https://open.spotify.com/track/…' });
  const fTitle  = input({ value: t.title  || '', placeholder:'Nome da peça' });
  const fArtist = input({ value: t.artist || '', placeholder:'Compositor / intérprete' });
  const fNote   = input({ value: t.note   || '', placeholder:'Ex.: entrar no 3º golpe do malhete' });

  const fileLabel = el('span', {}, t.fileName || 'nenhum arquivo');
  const btnFile = el('button', { class:'ghost-btn', onclick: async () => {
    const file = await pickFile();
    if(!file) return;
    pendingFile = { blob: file, name: file.name };
    fileLabel.textContent = file.name;
    if(!fTitle.value) fTitle.value = file.name.replace(/\.[^.]+$/, '');
  }}, 'Escolher arquivo…');

  let foundArt = t.artwork || '';
  const lookup = async () => {
    const p = SP.parseLink(fLink.value);
    if(!p) return;
    if(p.type !== 'track') return toast('Para playlists use "Importar playlist".');
    const info = await SP.oembed(p.type, p.id);
    if(info?.artwork) foundArt = info.artwork;
    if(info?.title && !fTitle.value) fTitle.value = info.title;
    if(info?.title) toast('Encontrado: ' + info.title);
    else toast('Link válido, mas não consegui o título. Preencha à mão.');
  };
  fLink.addEventListener('change', lookup);
  fLink.addEventListener('paste', () => setTimeout(lookup, 120));

  const body = el('div', {},
    existing ? field('Momento', fMoment, 'Troque aqui para mover a peça de lugar no roteiro.') : null,
    field('Link do Spotify', fLink,
      'No app do Spotify: <strong>⋯ → Compartilhar → Copiar link</strong>. O título é preenchido sozinho.' +
      (existing ? '' : '<br>Pode colar <strong>vários links de uma vez</strong> — vira uma peça para cada.')),
    field('Nome da peça', fTitle),
    field('Compositor / intérprete', fArtist),
    field('Anotação de execução', fNote, 'Sua deixa: quando entra, quando corta.'),
    el('div', { class:'field' },
      el('label', {}, 'Arquivo de áudio (para sobrepor duas faixas)'),
      el('div', { class:'field row' }, btnFile, el('div', { class:'hint', style:'flex:1' }, fileLabel)),
      el('p', { class:'hint' },
        'Só peças com arquivo podem ir para os decks A e B e tocar ao mesmo tempo. O arquivo fica guardado dentro do app, no iPad.')
    )
  );

  const buttons = [{ label:'Cancelar', onClick: c => c() }];
  if(existing){
    buttons.push({ label:'Apagar', kind:'danger', onClick: async c => {
      await S.removeTrack(m.id, existing.id); c(); paintMoments(); paintTracks();
    }});
  }
  buttons.push({ label:'Salvar', kind:'primary', onClick: async c => {
    // Vários links colados de uma vez viram várias peças.
    const varios = SP.parseLinks(fLink.value);
    if(!existing && varios.length > 1){
      const btn = $('#modalFoot .primary-btn');
      let n = 0;
      for(const id of varios){
        if(btn) btn.textContent = `Buscando ${++n} de ${varios.length}…`;
        const info = await SP.oembed('track', id);
        S.addTrack(m.id, {
          title: info?.title || 'Sem título',
          artwork: info?.artwork || '',
          spotifyId: id,
          spotifyUrl: SP.webUrl('track', id)
        });
      }
      c(); paintMoments(); paintTracks();
      toast(`${varios.length} peças adicionadas em "${m.name}".`);
      return;
    }

    const p = SP.parseLink(fLink.value);
    const data = {
      title: fTitle.value.trim() || 'Sem título',
      artist: fArtist.value.trim(),
      note: fNote.value.trim(),
      spotifyId: p && p.type === 'track' ? p.id : '',
      spotifyUrl: p && p.type === 'track' ? SP.webUrl('track', p.id) : '',
      artwork: foundArt
    };
    if(pendingFile){
      if(existing?.fileKey) await S.deleteFile(existing.fileKey).catch(()=>{});
      data.fileKey = await S.putFile(pendingFile.blob);
      data.fileName = pendingFile.name;
    }
    if(existing){
      S.updateTrack(existing.id, data);
      if(fMoment && fMoment.value !== m.id && S.moveTrackToMoment(existing.id, fMoment.value)){
        toast(`Movida para "${S.getMoment(fMoment.value).name}".`);
      }
    }else{
      S.addTrack(m.id, data);
    }
    c(); paintMoments(); paintTracks();
  }});

  modal({ title: existing ? 'Editar peça' : 'Nova peça', body, buttons });
}

function pickFile(){
  return new Promise(res => {
    const p = $('#filePicker');
    p.value = '';
    p.onchange = () => res(p.files[0] || null);
    p.click();
  });
}

/* ── Importar playlist ────────────────────── */

function openImport(){
  if(!spCanRead()){
    return modal({
      title:'Importar playlist',
      body: spFault
        ? `<div class="notice">${esc(spFault)}</div>`
        : `Importar uma playlist inteira exige a conexão com o Spotify (Ajustes → Conectar Spotify).
           <br><br>Sem conectar, você ainda adiciona peça por peça colando o link em <strong>+ Peça</strong>.`,
      buttons:[
        { label:'Fechar', onClick: c => c() },
        { label:'Ir para Ajustes', kind:'primary', onClick: c => { c(); openSettings(); } }
      ]
    });
  }

  const m0 = S.selectedMoment();
  const fLink = input({ placeholder:'https://open.spotify.com/playlist/…' });
  const fMoment = momentSelect(m0?.id);
  const status = el('p', { class:'hint' }, '');
  const lista = el('div');

  /* Escolher da própria conta evita erro de link e de propriedade. */
  const btnMinhas = el('button', { class:'ghost-btn', style:'width:100%', onclick: async () => {
    btnMinhas.textContent = 'Buscando…';
    try{
      const ps = await SP.myPlaylists(st.settings.clientId);
      lista.innerHTML = '';
      if(!ps.length){ lista.append(el('p', { class:'hint' }, 'Nenhuma playlist na conta.')); }
      for(const p of ps){
        lista.append(el('button', { class:'dev-item', onclick: () => {
          fLink.value = SP.webUrl('playlist', p.id);
          lista.innerHTML = '';
          status.textContent = `Escolhida: ${p.name}`;
        }},
          el('span', { class:'grow' }, p.name),
          el('span', { class:'badge' + (p.mine ? ' local' : '') }, p.mine ? 'sua' : (p.owner || 'de outro')),
          p.tracks === null ? null : el('span', { class:'badge' }, `${p.tracks}`)
        ));
      }
      btnMinhas.textContent = 'Minhas playlists';
    }catch(e){
      btnMinhas.textContent = 'Minhas playlists';
      lista.innerHTML = '';
      lista.append(el('div', { class:'notice' }, e.message));
    }
  }}, 'Minhas playlists');

  modal({
    title:'Importar playlist',
    body: el('div', {},
      field('Link da playlist', fLink,
        'No Spotify, na playlist: <strong>⋯ → Compartilhar → Copiar link</strong>.'),
      el('div', { class:'field' }, btnMinhas, lista),
      field('Levar as peças para', fMoment,
        'Se errar, dá para mover peça por peça depois (✎ na peça → Momento).'),
      status),
    buttons:[
      { label:'Cancelar', onClick: c => c() },
      { label:'Importar', kind:'primary', onClick: async () => {
          const p = SP.parseLink(fLink.value);
          if(!p || p.type !== 'playlist') return toast('Cole o link de uma playlist.', true);
          const m = S.getMoment(fMoment.value);
          if(!m) return toast('Escolha o momento de destino.', true);
          status.textContent = 'Buscando…';
          try{
            const items = await SP.playlistTracks(st.settings.clientId, p.id,
              (n, total) => { status.textContent = `Carregando ${n} de ${total}…`; });
            const existing = new Set((m.trackIds || []).map(id => st.tracks[id]?.spotifyId).filter(Boolean));
            let added = 0;
            for(const it of items){
              if(existing.has(it.spotifyId)) continue;
              S.addTrack(m.id, it); added++;
            }
            closeModal(); paintMoments(); paintTracks();
            toast(`${added} peça(s) importada(s)${items.length - added ? ` · ${items.length - added} já estavam aqui` : ''}.`);
          }catch(e){ status.textContent = ''; toast(e.message, true); }
      }}
    ]
  });
}

/* ═══════════ Spotify ═══════════ */

let spProfile = null;    // { display_name, product } quando a API responde de fato
let spFault = '';        // motivo, quando o token existe mas a API recusa
let spChecking = false;  // teste em andamento

/* A API só é consultada a cada 5s. Guardar a posição e o instante em
   que ela chegou deixa a barra correr suave nesse meio-tempo, em vez
   de pular de cinco em cinco segundos. */
let spPos = { ms: 0, dur: 0, at: 0, playing: false };

async function initSpotify(){
  SP.restore();
  const cid = st.settings.clientId;
  if(cid){
    try{
      if(await SP.handleRedirect(cid) === 'ok') toast('Spotify autorizado. Verificando…');
    }catch(e){ toast(e.message, true); }
  }
  paintSpotify();
  if(SP.connected()){
    await checkSpotify();
    pollSpotify();
    setInterval(() => { if(!document.hidden) pollSpotify(); }, 5000);
  }
}

/* Token válido não significa API liberada: em Development Mode o
   Spotify devolve 403 em tudo. Só chamando /me dá para saber. */
async function checkSpotify(){
  spProfile = null; spFault = ''; SP.auth.userId = '';
  if(!SP.connected()){ spChecking = false; paintSpotify(); return false; }
  spChecking = true; paintSpotify();
  try{
    // Se a rede engasgar, não deixa a interface presa em "Verificando…".
    spProfile = await Promise.race([
      SP.me(st.settings.clientId),
      new Promise((_, rej) => setTimeout(() => rej(new Error('O Spotify não respondeu. Verifique a internet e toque em "Testar de novo".')), 12000))
    ]);
    SP.auth.userId = spProfile?.id || '';     // permite marcar quais playlists são suas
    return true;
  }catch(e){
    spFault = e.message;
    return false;
  }finally{
    spChecking = false;
    paintSpotify();
  }
}

/* Dá para comandar daqui, a menos que a conta seja comprovadamente
   grátis. Plano desconhecido não bloqueia nada: se não der, quem diz
   é o próprio Spotify, com a mensagem certa. */
const spCanControl = () => !!spProfile && !spFault && spProfile.product !== 'free';
/* A API responde: dá para ler playlists (funciona também no plano grátis). */
const spCanRead = () => !!spProfile && !spFault;

async function pollSpotify(){
  if(!spCanControl()) return;
  try{
    spState = await SP.playbackState(st.settings.clientId);
    spPos = {
      ms: spState?.progress_ms || 0,
      dur: spState?.item?.duration_ms || 0,
      at: Date.now(),
      playing: !!spState?.is_playing
    };
    if(spState?.device){
      spDeviceId = spState.device.id;
      const v = spState.device.volume_percent;
      if(typeof v === 'number' && Math.abs(v - st.settings.volumes.S) > 2) faders.S?.set(v/100, true);
    }
    paintSpotify(); paintTracks();
  }catch(e){ /* silencioso: sondagem não deve incomodar o operador */ }
}

function paintSpotify(){
  const chip = $('#spotifyStatus'), label = $('.chip-label', chip);
  const deck = $('#spDeck');
  // Verde só quando a API respondeu de verdade (spProfile preenchido).
  const logged = SP.connected();
  const working = logged && !spFault && !!spProfile;

  let label_, cls;
  if(!logged){                 // sem token: nunca é "verificando"
    label_ = st.settings.clientId ? 'Toque para conectar' : 'Modo link';
    cls = st.settings.clientId ? 'chip-warn' : 'chip-off';
  }else if(spChecking){ label_ = 'Verificando…';       cls = 'chip-warn'; }
  else if(spFault){     label_ = 'Spotify bloqueado';  cls = 'chip-warn'; }
  else if(working){     label_ = spProfile.product === 'free' ? 'Spotify (grátis)' : 'Spotify'; cls = 'chip-on'; }
  else{                 label_ = 'Toque para conectar'; cls = 'chip-warn'; }

  chip.className = 'chip ' + cls;
  label.textContent = label_;
  deck.classList.toggle('off', !working);
  faders.S?.enable(spCanControl());

  if(logged && spFault){
    $('#spTitle').textContent = 'Spotify recusou o acesso';
    $('#spDevice').textContent = 'toque na luz acima para ver o motivo';
    spPos = { ms:0, dur:0, at:0, playing:false };
    return;
  }

  if(!working){
    $('#spTitle').textContent = logged ? 'Verificando o Spotify…' : 'Spotify em modo link';
    $('#spDevice').textContent = 'tocar abre o app do Spotify';
    spPos = { ms:0, dur:0, at:0, playing:false };
    $('#spToggle').classList.remove('on');
    return;
  }
  const it = spState?.item;
  $('#spTitle').textContent = it ? `${it.name} — ${(it.artists||[]).map(a=>a.name).join(', ')}` : 'Nada tocando';
  $('#spDevice').textContent = spState?.device ? spState.device.name : 'sem aparelho ativo';
  $('#spToggle').textContent = spState?.is_playing ? '❚❚' : '▶';
  $('#spToggle').classList.toggle('on', !!spState?.is_playing);
}

async function openDevices(){
  if(!SP.connected()) return toast('Conecte o Spotify em Ajustes.');
  const box = el('div', {}, el('p', { class:'hint' }, 'Carregando aparelhos…'));
  modal({ title:'Saída de som do Spotify', body: box, buttons:[{ label:'Fechar', onClick: c => c() }] });
  try{
    const d = await SP.devices(st.settings.clientId);
    box.innerHTML = '';
    if(!d?.devices?.length){
      box.append(el('div', { class:'notice' },
        'Nenhum aparelho visível. Abra o app do Spotify no iPad e deixe tocar 1 segundo — ele aparece aqui.'));
      return;
    }
    for(const dev of d.devices){
      box.append(el('button', { class:'dev-item' + (dev.is_active ? ' on' : ''), onclick: async () => {
        try{
          await SP.transferTo(st.settings.clientId, dev.id, false);
          spDeviceId = dev.id; toast('Saída: ' + dev.name);
          setTimeout(pollSpotify, 600); closeModal();
        }catch(e){ toast(e.message, true); }
      }},
        el('span', { class:'grow' }, dev.name),
        el('span', { class:'badge' }, dev.type),
        dev.is_active ? el('span', { class:'badge sp' }, 'ativo') : null
      ));
    }
  }catch(e){ box.innerHTML = ''; box.append(el('div', { class:'notice' }, e.message)); }
}

/* ═══════════ Ajustes ═══════════ */

/* Estado real da conexão, com botão para testar de novo na hora. */
function diagBox(){
  const box = el('div');
  const draw = () => {
    box.innerHTML = '';
    if(!SP.connected()){
      box.append(el('div', { class:'notice' },
        'Não conectado ao Spotify. Preencha o Client ID abaixo e toque em Conectar. ' +
        'Enquanto isso o app funciona em modo link: tocar uma peça abre o app do Spotify.'));
      return;
    }
    if(spChecking){
      box.append(el('p', { class:'hint' }, 'Verificando a conexão…'));
      return;
    }
    if(spFault){
      box.append(
        el('div', { class:'notice', style:'border-left-color:#e0524f' }, spFault),
        el('button', { class:'ghost-btn', style:'margin-top:10px', onclick: async e => {
            e.target.textContent = 'Testando…';
            await checkSpotify(); draw();
            toast(spFault ? 'Ainda bloqueado.' : 'Conexão funcionando agora.', !!spFault);
        }}, 'Testar de novo')
      );
      return;
    }
    if(spProfile){
      const plano = spProfile.product || 'não informado';
      const gratis = spProfile.product === 'free';
      box.append(el('div', { class:'notice' },
        `Conectado como ${spProfile.display_name || spProfile.id} · plano ${plano}. ` +
        (gratis ? 'Importar playlists funciona; comandar a reprodução daqui exige Premium.'
                : 'Importação e controle liberados.')));
      return;
    }
    box.append(el('p', { class:'hint' }, 'Verificando a conexão…'));
  };
  draw();
  return box;
}

/* Roda uma bateria de chamadas e mostra a resposta crua de cada uma.
   Existe para acabar com o chute: o Spotify diz "403 Forbidden" sem
   explicar, então a única saída é comparar o que passa e o que não passa. */
async function openDiagnostico(){
  const box = el('div', {}, el('p', { class:'hint' }, 'Testando…'));
  modal({ title:'Diagnóstico do Spotify', body: box, buttons:[{ label:'Fechar', kind:'primary', onClick: c => c() }] });

  const cid = st.settings.clientId;
  const linhas = [];
  const add = r => linhas.push(`${r.status}  GET ${r.path}\n${r.corpo}`);

  add(await SP.probe(cid, '/me'));
  const lp = await SP.probe(cid, '/me/playlists?limit=1');
  add(lp);

  // pega o id da primeira playlist para sondar o conteúdo dela
  let pid = null;
  try{ pid = JSON.parse(lp.corpo.replace(/…$/,''))?.items?.[0]?.id; }catch(e){}
  if(!pid){
    try{ const ps = await SP.myPlaylists(cid); pid = ps[0]?.id; }catch(e){}
  }
  if(pid){
    add(await SP.probe(cid, `/playlists/${pid}`));
    add(await SP.probe(cid, `/playlists/${pid}/tracks?limit=1`));
  }
  add(await SP.probe(cid, '/me/tracks?limit=1'));

  box.innerHTML = '';
  box.append(
    el('p', { class:'hint' }, 'Copie este bloco inteiro e envie para quem cuida do app:'),
    el('div', { class:'notice', style:'font-size:12px' },
      `escopos pedidos: ${SP.grantedScopes()}\n\n` + linhas.join('\n\n'))
  );
}

function openSettings(){
  const cid = input({ value: st.settings.clientId, placeholder:'cole aqui o Client ID' });
  const openApp = el('select', {},
    el('option', { value:'app', selected: st.settings.openInApp ? '' : null }, 'Abrir no app do Spotify'),
    el('option', { value:'web', selected: st.settings.openInApp ? null : '' }, 'Abrir no navegador')
  );

  const connectRow = el('div', { class:'field row' },
    el('button', { class:'primary-btn', onclick: async () => {
        st.settings.clientId = cid.value.trim(); S.save();
        if(!st.settings.clientId) return toast('Preencha o Client ID.', true);
        try{ await SP.login(st.settings.clientId); }catch(e){ toast(e.message, true); }
    }}, SP.connected() ? 'Reconectar' : 'Conectar Spotify'),
    SP.connected()
      ? el('button', { class:'ghost-btn', onclick: () => { SP.logout(); paintSpotify(); closeModal(); toast('Desconectado.'); } }, 'Desconectar')
      : null
  );

  const body = el('div', {},
    el('div', { class:'notice', html:
      '<strong>Sobreposição de duas faixas:</strong> o Spotify comanda um player só — não existe forma de tocar duas músicas dele ao mesmo tempo. ' +
      'Para a trilha entrar por baixo da outra, a peça precisa ter <strong>arquivo de áudio</strong> e ir para os decks A/B. ' +
      'Usando só Spotify, a única sobreposição possível é o <em>crossfade</em> dele: app do Spotify → Ajustes → Reprodução → Crossfade (até 12s).' }),

    el('h4', { style:'margin:20px 0 10px;color:var(--gold)' }, 'Conexão com o Spotify (opcional)'),
    diagBox(),
    field('Client ID', cid,
      'Só é preciso se você quiser comandar o Spotify sem sair daqui e importar playlists inteiras. Exige conta <strong>Premium</strong>.'),
    connectRow,
    el('p', { class:'hint', html:
      'Ao criar o app em developer.spotify.com, use exatamente este Redirect URI:<br><code>' + esc(SP.redirectUri()) + '</code>' }),
    el('div', { class:'field', style:'margin-top:12px' },
      el('button', { class:'ghost-btn', onclick: openDiagnostico }, 'Diagnóstico da conexão')),
    el('div', { class:'field', style:'margin-top:16px' },
      el('label', {}, 'Ao tocar uma peça sem conexão'), openApp),

    el('h4', { style:'margin:22px 0 10px;color:var(--gold)' }, 'Cópia de segurança'),
    el('p', { class:'hint' }, 'Guarde seu roteiro. O JSON leva momentos, peças, links e anotações — os arquivos de áudio ficam só no iPad e precisam ser reimportados.'),
    el('div', { class:'field row', style:'margin-top:10px' },
      el('button', { class:'ghost-btn', onclick: doExport }, 'Exportar roteiro'),
      el('button', { class:'ghost-btn', onclick: doImport }, 'Importar arquivo'),
      el('button', { class:'ghost-btn', onclick: openImportUrl }, 'Receber roteiro')
    ),
    el('p', { class:'hint', id:'storageLine' }, ''),

    el('h4', { style:'margin:22px 0 10px;color:var(--gold)' }, 'Como instalar no iPad'),
    el('div', { class:'help', html:
      '<ol><li>Abra este endereço no <strong>Safari</strong> do iPad.</li>' +
      '<li>Toque no botão <strong>Compartilhar</strong> (quadrado com a seta).</li>' +
      '<li>Escolha <strong>Adicionar à Tela de Início</strong>.</li>' +
      '<li>Abra pelo ícone: entra em tela cheia e funciona sem internet.</li></ol>' })
  );

  modal({
    title:'Ajustes',
    body,
    buttons:[{ label:'Fechar', kind:'primary', onClick: c => {
      st.settings.clientId = cid.value.trim();
      st.settings.openInApp = openApp.value === 'app';
      S.save(); paintSpotify(); c();
    }}]
  });

  Promise.all([S.storageInfo(), S.ehPersistente()]).then(([i, persistente]) => {
    const line = $('#storageLine');
    if(!line) return;
    const espaco = i ? `Espaço usado pelo app no iPad: ${(i.usage/1048576).toFixed(1)} MB de ${(i.quota/1073741824).toFixed(1)} GB disponíveis. ` : '';
    const protecao = persistente === true
      ? 'Os dados estão protegidos: o iPad não vai apagá-los para liberar espaço.'
      : persistente === false
        ? 'Atenção: o iPad ainda pode apagar os dados do app para liberar espaço. Exporte o roteiro de vez em quando.'
        : '';
    line.textContent = espaco + protecao;
  });
}

/* Recebe um roteiro publicado num endereço. Existe porque passar um
   arquivo JSON para dentro do iPad é trabalhoso, e o caminho normal de
   montar o repertório passou a ser preparar tudo fora e mandar pronto. */
function openImportUrl(){
  const fUrl = input({
    value: new URL('roteiro.json', location.href).href,
    placeholder:'https://…/roteiro.json'
  });
  const status = el('p', { class:'hint' }, '');

  const puxar = async merge => {
    status.textContent = 'Buscando…';
    try{
      const r = await fetch(fUrl.value.trim(), { cache:'no-store' });
      if(!r.ok) throw new Error(`O endereço respondeu ${r.status}.`);
      const texto = await r.text();
      const n = S.importJSON(texto, { merge });
      closeModal(); renderAll();
      toast(merge ? `${n} peça(s) somada(s) ao roteiro.` : 'Roteiro substituído.');
    }catch(e){
      status.textContent = '';
      toast('Não deu para receber: ' + e.message, true);
    }
  };

  modal({
    title:'Receber roteiro',
    body: el('div', {},
      field('Endereço do roteiro', fUrl,
        'Um arquivo .json preparado fora do iPad. O padrão é o roteiro publicado junto com o app.'),
      el('div', { class:'notice' },
        'Somar mantém o que você já montou e só acrescenta o que falta, casando os momentos pelo nome. ' +
        'Substituir apaga o roteiro atual e coloca o novo no lugar.'),
      status),
    buttons:[
      { label:'Cancelar', onClick: c => c() },
      { label:'Substituir tudo', kind:'danger', onClick: () => puxar(false) },
      { label:'Somar ao meu', kind:'primary', onClick: () => puxar(true) }
    ]
  });
}

function doExport(){
  const blob = new Blob([S.exportJSON()], { type:'application/json' });
  const a = el('a', {
    href: URL.createObjectURL(blob),
    download: `harmonia-${new Date().toISOString().slice(0,10)}.json`
  });
  document.body.append(a); a.click(); a.remove();
  toast('Roteiro exportado.');
}

function doImport(){
  const p = $('#jsonPicker');
  p.value = '';
  p.onchange = async () => {
    const f = p.files[0]; if(!f) return;
    try{
      S.importJSON(await f.text());
      closeModal(); renderAll();
      toast('Roteiro importado.');
    }catch(e){ toast('Arquivo inválido: ' + e.message, true); }
  };
  p.click();
}

/* ═══════════ Desenho contínuo ═══════════ */

function paintDeck(id){
  const node = $(`#deck${id}-el`);
  const d = A.decks[id];
  const loaded = A.isLoaded(id), playing = A.isPlaying(id);
  $('[data-role="title"]', node).textContent = loaded ? (d.title || 'sem nome') : '— vazio —';
  node.classList.toggle('live', playing);
  const btn = $(`.deck-btn.play[data-deck="${id}"]`);
  btn.textContent = playing ? '❚❚' : '▶';
  btn.classList.toggle('on', playing);
}

function tick(){
  let anyPlaying = false;
  for(const id of ['A','B']){
    const node = $(`#deck${id}-el`);
    const { cur, dur, ratio } = A.times(id);
    $('[data-role="time"]', node).textContent = `${mmss(cur)} / ${mmss(dur)}`;
    const scrub = $(`input[data-role="scrub"][data-deck="${id}"]`);
    if(!scrub.dataset.holding) scrub.value = Math.round(ratio * 1000);
    scrub.style.setProperty('--p', (ratio * 100).toFixed(1) + '%');
    scrub.disabled = !A.isLoaded(id);
    if(A.isPlaying(id)) anyPlaying = true;
  }
  pintarBarraSpotify();
  if(anyPlaying !== tick.last){
    tick.last = anyPlaying;
    A.keepAwake(anyPlaying);
    paintDeck('A'); paintDeck('B'); paintTracks();
  }
}

/* Posição estimada do Spotify: o que a API disse, mais o tempo que
   passou desde então enquanto estiver tocando. */
function pintarBarraSpotify(){
  const scrub = $('#spScrub');
  const dur = spPos.dur;
  const decorrido = spPos.playing ? Date.now() - spPos.at : 0;
  const ms = dur ? Math.min(dur, spPos.ms + decorrido) : 0;
  const ratio = dur ? ms / dur : 0;

  $('#spTime').textContent = `${mmss(ms / 1000)} / ${mmss(dur / 1000)}`;
  if(!scrub.dataset.holding) scrub.value = Math.round(ratio * 1000);
  scrub.style.setProperty('--p', (ratio * 100).toFixed(1) + '%');
  scrub.disabled = !spCanControl() || !dur;
}

function renderAll(){
  $('#lodgeName').textContent = st.lodge;
  paintMoments(); paintTracks(); paintDeck('A'); paintDeck('B'); paintSpotify();
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));

boot();
