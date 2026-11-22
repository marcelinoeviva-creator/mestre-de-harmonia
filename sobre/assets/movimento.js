/* ==========================================================
   Mestre de Harmonia — página de apresentação: comportamento e movimento

   A página funciona inteira sem este arquivo e sem o GSAP: tudo nasce
   visível. O movimento é uma camada por cima, e some por completo para
   quem pediu ao sistema menos animação.
   ========================================================== */
(() => {
  'use strict';

  const $  = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const raiz = document.documentElement;
  const reduz = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ponteiroFino = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const largo = () => innerWidth >= 1000;
  const G = window.gsap;
  const ST = window.ScrollTrigger;
  const comMovimento = !!(G && ST) && !reduz;

  /* ─── Cabeçalho, progresso e menu ─────────────── */

  const topo = $('#topo');
  const barra = $('.progresso span');
  const menuBtn = $('.menu-btn');
  const menu = $('#menu-movel');
  let menuAberto = false;
  let ultimoY = scrollY, pedido = 0;

  function aoRolar(){
    pedido = 0;
    const y = scrollY;
    topo.classList.toggle('rolado', y > 30);
    topo.classList.toggle('escondido', !menuAberto && y > ultimoY + 2 && y > 640);
    if(y < ultimoY - 2) topo.classList.remove('escondido');
    ultimoY = y;
    const total = raiz.scrollHeight - innerHeight;
    barra.style.transform = `scaleX(${total > 0 ? Math.min(1, y / total) : 0})`;
  }
  addEventListener('scroll', () => { if(!pedido) pedido = requestAnimationFrame(aoRolar); }, { passive:true });
  aoRolar();

  function abrirMenu(abrir){
    menuAberto = abrir;
    menuBtn.setAttribute('aria-expanded', String(abrir));
    menuBtn.querySelector('.sr').textContent = abrir ? 'Fechar o menu' : 'Abrir o menu';
    menu.hidden = !abrir;
    document.body.style.overflow = abrir ? 'hidden' : '';
    topo.classList.remove('escondido');
    if(abrir && comMovimento){
      G.fromTo(menu, { opacity:0 }, { opacity:1, duration:.5, ease:'power2.out' });
      G.fromTo($$('a', menu), { y:30, opacity:0 }, { y:0, opacity:1, duration:.9, ease:'expo.out', stagger:.05 });
    }
  }
  menuBtn.addEventListener('click', () => abrirMenu(!menuAberto));
  $$('a', menu).forEach(a => a.addEventListener('click', () => abrirMenu(false)));
  addEventListener('keydown', e => { if(e.key === 'Escape' && menuAberto){ abrirMenu(false); menuBtn.focus(); } });
  addEventListener('resize', () => { if(menuAberto && innerWidth >= 1180) abrirMenu(false); });

  /* ─── Seção atual: trilho lateral e menu do topo ─ */

  const secoes = $$('[data-secao]');
  const marcarSecao = id => {
    $$('.trilho a').forEach(a => a.setAttribute('aria-current', String(a.dataset.alvo === id)));
    $$('.nav a').forEach(a => a.setAttribute('aria-current', String(a.getAttribute('href') === '#' + id)));
  };
  const obsSecao = new IntersectionObserver(entradas => {
    entradas.forEach(e => { if(e.isIntersecting) marcarSecao(e.target.id); });
  }, { rootMargin:'-45% 0px -50% 0px' });
  secoes.forEach(s => obsSecao.observe(s));

  /* ─── Abas da instalação ─────────────────────── */

  const abas = $$('[role="tab"]');
  const marcador = $('.abas-marcador');
  function posicionarMarcador(){
    const ativa = abas.find(a => a.getAttribute('aria-selected') === 'true');
    if(!ativa || !marcador) return;
    marcador.style.left = ativa.offsetLeft + 'px';
    marcador.style.width = ativa.offsetWidth + 'px';
  }
  function escolherAba(aba, focar){
    abas.forEach(a => {
      const sim = a === aba;
      a.setAttribute('aria-selected', String(sim));
      a.tabIndex = sim ? 0 : -1;
      $('#' + a.getAttribute('aria-controls')).hidden = !sim;
    });
    if(focar) aba.focus();
    posicionarMarcador();
    const painel = $('#' + aba.getAttribute('aria-controls'));
    if(comMovimento){
      G.fromTo($$('.passo', painel), { y:26, opacity:0 }, { y:0, opacity:1, duration:.9, ease:'expo.out', stagger:.07, overwrite:true });
      G.fromTo($('.observacao', painel), { opacity:0 }, { opacity:1, duration:.8, delay:.3 });
    }
    ST && ST.refresh();
  }
  abas.forEach((aba, i) => {
    aba.addEventListener('click', () => escolherAba(aba));
    aba.addEventListener('keydown', e => {
      const n = abas.length;
      let alvo = null;
      if(e.key === 'ArrowRight') alvo = abas[(i + 1) % n];
      if(e.key === 'ArrowLeft')  alvo = abas[(i - 1 + n) % n];
      if(e.key === 'Home') alvo = abas[0];
      if(e.key === 'End')  alvo = abas[n - 1];
      if(alvo){ e.preventDefault(); escolherAba(alvo, true); }
    });
  });
  // Quem chega de um iPhone ou Android já vê o tutorial do próprio aparelho.
  const ua = navigator.userAgent;
  const ehApple = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const inicial = /Android/i.test(ua) ? abas[1] : (!ehApple && !/Mobi/i.test(ua) && /Windows|Macintosh|Linux/.test(ua)) ? abas[2] : abas[0];
  if(inicial && inicial !== abas[0]){
    abas.forEach(a => { const sim = a === inicial; a.setAttribute('aria-selected', String(sim)); a.tabIndex = sim ? 0 : -1; $('#' + a.getAttribute('aria-controls')).hidden = !sim; });
  }
  posicionarMarcador();
  addEventListener('resize', posicionarMarcador);
  document.fonts && document.fonts.ready.then(posicionarMarcador);

  /* ─── Perguntas ─────────────────────────────── */

  $$('.sf-item button').forEach(btn => {
    btn.addEventListener('click', () => {
      const aberto = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!aberto));
      btn.closest('.sf-item').classList.toggle('aberto', !aberto);
    });
  });

  /* ─── Visualização ampliada ─────────────────── */

  const lupa = $('.lupa');
  const lupaImg = $('img', lupa);
  const lupaLeg = $('figcaption', lupa);
  const fotos = $$('.abre-lupa');
  let atual = 0, origem = null;

  function mostrar(i){
    atual = (i + fotos.length) % fotos.length;
    const b = fotos[atual];
    lupaImg.src = b.dataset.lupa;
    lupaImg.alt = $('img', b).alt;
    lupaLeg.textContent = b.dataset.legenda || '';
    if(comMovimento) G.fromTo(lupaImg, { opacity:0, scale:.97 }, { opacity:1, scale:1, duration:.7, ease:'expo.out' });
  }
  function abrirLupa(i, botao){
    origem = botao;
    mostrar(i);
    if(typeof lupa.showModal === 'function') lupa.showModal(); else lupa.setAttribute('open', '');
    document.body.style.overflow = 'hidden';
  }
  function fecharLupa(){
    if(lupa.open) lupa.close();
  }
  lupa.addEventListener('close', () => { document.body.style.overflow = ''; origem && origem.focus(); });
  fotos.forEach((b, i) => b.addEventListener('click', () => abrirLupa(i, b)));
  $('.lupa-fechar').addEventListener('click', fecharLupa);
  $('.lupa-ant').addEventListener('click', () => mostrar(atual - 1));
  $('.lupa-prox').addEventListener('click', () => mostrar(atual + 1));
  lupa.addEventListener('click', e => { if(e.target === lupa || e.target.tagName === 'FIGURE') fecharLupa(); });
  lupa.addEventListener('keydown', e => {
    if(e.key === 'ArrowRight') mostrar(atual + 1);
    if(e.key === 'ArrowLeft')  mostrar(atual - 1);
  });
  // deslizar para o lado no celular
  let toqueX = null;
  lupa.addEventListener('touchstart', e => { toqueX = e.touches[0].clientX; }, { passive:true });
  lupa.addEventListener('touchend', e => {
    if(toqueX === null) return;
    const dx = e.changedTouches[0].clientX - toqueX;
    if(Math.abs(dx) > 50) mostrar(atual + (dx < 0 ? 1 : -1));
    toqueX = null;
  });

  /* ─── Percurso da sessão: destaque que acompanha o texto ─ */

  const AREAS = {
    momentos: { x:.5,  y:8.4,  w:21.6, h:51.6 },
    deixas:   { x:.3,  y:60.6, w:99.4, h:6.9 },
    mesa:     { x:.5,  y:67.9, w:99,   h:31.6 },
    spotify:  { x:71.8, y:69.8, w:27.4, h:29.4 },
    ajustes:  { x:91.5, y:1.5, w:7.6,  h:5.4 }
  };
  const foco = $('[data-foco]');
  const passos = $$('[data-passo]');
  const marcas = $$('.percurso-marcas li');
  function passoAtivo(i){
    passos.forEach((p, j) => p.classList.toggle('ativo', j === i));
    marcas.forEach((m, j) => m.classList.toggle('ativa', j === i));
    const a = AREAS[passos[i].dataset.focoArea];
    if(a && foco){
      foco.style.setProperty('--x', a.x + '%');
      foco.style.setProperty('--y', a.y + '%');
      foco.style.setProperty('--w', a.w + '%');
      foco.style.setProperty('--h', a.h + '%');
    }
  }
  const obsPasso = new IntersectionObserver(entradas => {
    entradas.forEach(e => { if(e.isIntersecting) passoAtivo(passos.indexOf(e.target)); });
  }, { rootMargin:'-52% 0px -42% 0px' });
  passos.forEach(p => obsPasso.observe(p));

  /* ─── Versão publicada, lida do próprio aplicativo ─ */

  fetch('../sw.js', { cache:'no-store' })
    .then(r => r.ok ? r.text() : '')
    .then(t => {
      const m = t.match(/VERSION\s*=\s*'(\d{4})-(\d{2})-(\d{2})-([a-z]+)'/);
      if(!m) return;
      $$('[data-versao]').forEach(el => { el.textContent = `${m[3]}/${m[2]}-${m[4]}`; });
      $$('[data-linha-versao]').forEach(el => { el.hidden = false; });
    })
    .catch(() => {});

  /* ─── Daqui para baixo, só movimento ─────────── */

  if(!comMovimento){
    raiz.classList.remove('pre');
    return;
  }

  G.registerPlugin(ST);
  G.defaults({ ease:'expo.out' });

  /* Quebra um título em palavras, cada uma com a sua máscara,
     preservando o <em> que dá o itálico dourado. */
  function emPalavras(el){
    const quebra = no => {
      const frag = document.createDocumentFragment();
      no.childNodes.forEach(filho => {
        if(filho.nodeType === 3){
          filho.textContent.split(/(\s+)/).forEach(parte => {
            if(!parte) return;
            if(/^\s+$/.test(parte)){ frag.append(document.createTextNode(' ')); return; }
            const fora = document.createElement('span'); fora.className = 'palavra';
            const dentro = document.createElement('span'); dentro.textContent = parte;
            fora.append(dentro); frag.append(fora);
          });
        }else if(filho.nodeType === 1){
          const copia = filho.cloneNode(false);
          copia.append(quebra(filho));
          frag.append(copia);
        }
      });
      return frag;
    };
    const novo = quebra(el);
    el.textContent = '';
    el.append(novo);
    return $$('.palavra > span', el);
  }

  /* Traço desenhado: prepara um SVG para "ser escrito". */
  function prepararTraco(els){
    els.forEach(el => {
      const n = el.getTotalLength ? el.getTotalLength() : 0;
      el.style.strokeDasharray = n;
      el.style.strokeDashoffset = n;
    });
    return els;
  }

  /* ─── Primeira dobra ─────────────────────────── */

  const tablet = $('.hero-tablet');
  const celular = $('.hero-celular');
  const giro = $('[data-giro]');
  const base = largo() ? { ry:-15, rx:7 } : { ry:-8, rx:4 };
  G.set(giro, { rotationY:base.ry, rotationX:base.rx, rotationZ: largo() ? .6 : 0 });
  const linhasTitulo = $$('[data-intro="linha"]');
  G.set(linhasTitulo, { yPercent:118, rotate:3 });
  const tracosHero = prepararTraco($$('.hero-geometria path, .hero-geometria circle'));
  raiz.classList.remove('pre');

  const intro = G.timeline({ defaults:{ duration:1.4 } });
  intro
    .from('.luz', { opacity:0, scale:.7, duration:2.6, stagger:.3, ease:'power2.out' }, 0)
    .to(tracosHero, { strokeDashoffset:0, duration:3.2, stagger:.08, ease:'power2.inOut' }, .1)
    .from('.hero .sobretitulo .traco', { scaleX:0, transformOrigin:'left center', duration:1.2 }, .2)
    .from('.hero .sobretitulo', { opacity:0, x:-12, duration:1.2 }, .25)
    .to(linhasTitulo, { yPercent:0, rotate:0, duration:1.5, stagger:.12 }, .35)
    .from('[data-intro="sub"]', { opacity:0, y:26, duration:1.3 }, .85)
    .from('[data-intro="acoes"] > *', { opacity:0, y:22, stagger:.09, duration:1.2 }, 1.0)
    .from('[data-intro="selos"] li', { opacity:0, y:12, stagger:.05, duration:1 }, 1.15)
    .from(tablet, { opacity:0, y:140, z:-200, rotationX:24, duration:2.1 }, .2)
    .fromTo('[data-intro="tela"] img', { clipPath:'inset(0% 0% 100% 0%)', scale:1.08 },
                                       { clipPath:'inset(0% 0% 0% 0%)', scale:1, duration:1.6, ease:'power3.inOut' }, .95)
    .from(celular, { opacity:0, x:-70, y:90, rotation:-7, duration:1.9 }, 1.0)
    .fromTo('.hero-tablet .reflexo', { xPercent:-130 }, { xPercent:130, duration:2, ease:'power2.inOut' }, 1.9)
    .from('[data-intro="nota"]', { opacity:0, scale:.6, stagger:.2, duration:1.1, ease:'back.out(2)' }, 2.2)
    .from('[data-intro="rolar"]', { opacity:0, y:-10, duration:1 }, 2.3)
    .add(() => {
      G.to(tablet,  { y:-8,  duration:4.6, yoyo:true, repeat:-1, ease:'sine.inOut' });
      G.to(celular, { y:-12, duration:3.4, yoyo:true, repeat:-1, ease:'sine.inOut', delay:.6 });
    });

  // A mesa inclina de leve na direção do cursor.
  if(ponteiroFino){
    const hero = $('.hero');
    const ry = G.quickTo(giro, 'rotationY', { duration:1.6, ease:'power3.out' });
    const rx = G.quickTo(giro, 'rotationX', { duration:1.6, ease:'power3.out' });
    let quadro = 0;
    hero.addEventListener('pointermove', e => {
      if(quadro) return;
      quadro = requestAnimationFrame(() => {
        quadro = 0;
        const r = hero.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - .5;
        const py = (e.clientY - r.top) / r.height - .5;
        hero.style.setProperty('--mx', (px + .5) * 100 + '%');
        hero.style.setProperty('--my', (py + .5) * 100 + '%');
        if(largo()){ ry(base.ry + px * 7); rx(base.rx - py * 5); }
      });
    });
    hero.addEventListener('pointerleave', () => { if(largo()){ ry(base.ry); rx(base.rx); } });
  }

  // Ao rolar, a primeira dobra se afasta em camadas.
  G.to('.hero-texto', { y:-80, opacity:.15, ease:'none',
    scrollTrigger:{ trigger:'.hero', start:'top top', end:'bottom top', scrub:true } });
  G.to('[data-palco]', { yPercent:-10, ease:'none',
    scrollTrigger:{ trigger:'.hero', start:'top top', end:'bottom top', scrub:true } });
  G.to('.hero-geometria .circulos', { rotation:18, transformOrigin:'68% 48%', ease:'none',
    scrollTrigger:{ trigger:'.hero', start:'top top', end:'bottom top', scrub:true } });
  G.to('.hero-geometria .pauta', { y:-60, ease:'none',
    scrollTrigger:{ trigger:'.hero', start:'top top', end:'bottom top', scrub:true } });

  /* ─── Linguagens comuns ─────────────────────── */

  // Fio dourado no topo de cada seção: se estende ao entrar.
  $$('.secao').forEach(s => {
    G.fromTo(s, { '--linha':0 }, { '--linha':1, ease:'none',
      scrollTrigger:{ trigger:s, start:'top bottom', end:'top 35%', scrub:true } });
  });

  // Títulos: palavras sobem de dentro da própria linha.
  $$('[data-palavras]').forEach(el => {
    const palavras = emPalavras(el);
    G.from(palavras, { yPercent:115, rotate:2, duration:1.25, stagger:.045,
      scrollTrigger:{ trigger:el, start:'top 86%' } });
  });

  // Sobretítulos: o traço se desenha antes do texto.
  $$('.secao .sobretitulo, .primeiro .sobretitulo').forEach(el => {
    G.timeline({ scrollTrigger:{ trigger:el, start:'top 88%' } })
      .from($$('.traco', el), { scaleX:0, transformOrigin:'left center', duration:1.1 })
      .from(el, { opacity:0, letterSpacing:'.5em', duration:1.4 }, 0);
  });

  $$('[data-sobe]').forEach(el => {
    G.from(el, { y:30, opacity:0, duration:1.3, scrollTrigger:{ trigger:el, start:'top 90%' } });
  });

  /* ─── O aplicativo: cada recurso entra como uma página de revista ─ */

  $$('[data-recurso]').forEach(rec => {
    const num = $('.recurso-num', rec);
    const rotulo = $('.recurso-rotulo', rec);
    const textos = $$('.recurso-texto > p:not(.recurso-rotulo), .tracos li', rec);
    const tl = G.timeline({ scrollTrigger:{ trigger:rec, start:'top 78%' } });
    tl.from(num, { opacity:0, x:-40, duration:1.6 }, 0)
      .from(rotulo, { opacity:0, y:14, duration:1 }, .1)
      .from(textos, { opacity:0, y:22, stagger:.08, duration:1.2 }, .35);

    // O número desliza mais devagar que o texto: profundidade.
    G.to(num, { yPercent:-40, ease:'none',
      scrollTrigger:{ trigger:rec, start:'top bottom', end:'bottom top', scrub:true } });

    // Imagens: uma máscara se abre e a captura assenta.
    const inverso = rec.classList.contains('recurso-inverso');
    $$('[data-revela]', rec).forEach((jan, j) => {
      const img = $('img', jan);
      const de = rec.classList.contains('recurso-largo')
        ? 'inset(14% 10% 14% 10% round 16px)'
        : inverso ? 'inset(8% 22% 8% 0% round 16px)' : 'inset(8% 0% 8% 22% round 16px)';
      G.timeline({ scrollTrigger:{ trigger:jan, start:'top 85%' } })
        .fromTo(jan, { clipPath:de, opacity:.0 }, { clipPath:'inset(0% 0% 0% 0% round 16px)', opacity:1, duration:1.8, ease:'expo.inOut', delay:j * .25 })
        .from(img, { scale:1.18, duration:2.2, ease:'expo.out' }, '<.1')
        .add(() => { jan.style.clipPath = ''; });
      if(largo()){
        G.fromTo(jan, { y:40 }, { y:-40, ease:'none',
          scrollTrigger:{ trigger:jan, start:'top bottom', end:'bottom top', scrub:true } });
      }
    });
  });

  // A barra de deixas se descola do painel.
  const tira = $('[data-tira]');
  if(tira){
    G.fromTo(tira, { y:0, scale:.96, opacity:0 }, { y: () => largo() ? -42 : -18, scale:1.03, opacity:1, ease:'none',
      scrollTrigger:{ trigger:'.composicao-deixas', start:'top 72%', end:'center 45%', scrub:1 } });
  }

  G.from('.legenda-mesa li', { opacity:0, y:16, stagger:.1, duration:1.1,
    scrollTrigger:{ trigger:'.legenda-mesa', start:'top 92%' } });

  /* ─── Na sessão ─────────────────────────────── */

  G.from('.percurso-tablet', { opacity:0, scale:.92, y:60, duration:1.8,
    scrollTrigger:{ trigger:'.percurso', start:'top 80%' } });
  G.from('.percurso-marcas li', { opacity:0, scaleX:0, stagger:.06, duration:1,
    scrollTrigger:{ trigger:'.percurso', start:'top 70%' } });

  $$('[data-conta]').forEach(el => {
    const alvo = +el.dataset.conta;
    const obj = { v:0 };
    el.textContent = '0';
    G.to(obj, { v:alvo, duration:alvo ? 1.8 : .1, ease:'power2.out',
      onUpdate: () => { el.textContent = Math.round(obj.v); },
      scrollTrigger:{ trigger:el, start:'top 90%' } });
  });
  G.from('.numeros > div', { opacity:0, y:30, stagger:.1, duration:1.2,
    scrollTrigger:{ trigger:'.numeros', start:'top 88%' } });

  /* ─── Sigilo: os círculos se fecham ─────────── */

  const circulos = prepararTraco($$('.sigilo-geometria circle:not(.ponto)'));
  G.to(circulos, { strokeDashoffset:0, stagger:.15, ease:'none',
    scrollTrigger:{ trigger:'.sigilo', start:'top 75%', end:'top 10%', scrub:1 } });
  G.from('.sigilo-geometria .ponto', { scale:0, transformOrigin:'50% 50%', duration:1.4, ease:'back.out(3)',
    scrollTrigger:{ trigger:'.sigilo', start:'top 30%' } });
  G.to('.sigilo-geometria', { rotation:30, ease:'none',
    scrollTrigger:{ trigger:'.sigilo', start:'top bottom', end:'bottom top', scrub:true } });

  /* ─── Galeria: camadas em velocidades diferentes ─ */

  $$('.peca-galeria').forEach((p, i) => {
    G.from(p, { opacity:0, y:90, duration:1.6, delay:(i % 3) * .08,
      scrollTrigger:{ trigger:p, start:'top 92%' } });
    const v = parseFloat(p.dataset.velocidade || 0);
    if(v && largo()){
      G.to(p, { y: () => v * -innerHeight, ease:'none',
        scrollTrigger:{ trigger:'.mosaico', start:'top bottom', end:'bottom top', scrub:true, invalidateOnRefresh:true } });
    }
  });

  /* ─── Instalação ─────────────────────────────── */

  G.from('.abas-lista', { opacity:0, y:20, duration:1.2, scrollTrigger:{ trigger:'.abas', start:'top 85%' } });
  $$('.aba-painel').forEach(painel => {
    G.from($$('.passo', painel), { opacity:0, y:40, stagger:.1, duration:1.3,
      scrollTrigger:{ trigger:painel, start:'top 82%' } });
    G.fromTo($('.passos', painel), { '--progresso-passos':0 }, { '--progresso-passos':1, ease:'none',
      scrollTrigger:{ trigger:painel, start:'top 80%', end:'top 30%', scrub:true } });
  });
  G.from('.grade-primeiro li', { opacity:0, y:30, stagger:.08, duration:1.2,
    scrollTrigger:{ trigger:'.grade-primeiro', start:'top 85%' } });

  /* ─── Perguntas ─────────────────────────────── */

  G.from('.sf-item', { opacity:0, y:24, stagger:.06, duration:1.1,
    scrollTrigger:{ trigger:'.sanfona', start:'top 85%' } });

  /* ─── Fecho ─────────────────────────────── */

  G.from('.fecho-selo', { opacity:0, scale:.6, rotation:-40, duration:2,
    scrollTrigger:{ trigger:'.fecho', start:'top 70%' } });
  G.from('.fecho .btn', { opacity:0, y:20, duration:1.2, delay:.5,
    scrollTrigger:{ trigger:'.fecho', start:'top 70%' } });

  /* ─── Botões que respondem ao cursor ─────────── */

  if(ponteiroFino){
    $$('[data-ima]').forEach(btn => {
      const x = G.quickTo(btn, 'x', { duration:.8, ease:'power3.out' });
      const y = G.quickTo(btn, 'y', { duration:.8, ease:'power3.out' });
      btn.addEventListener('pointermove', e => {
        const r = btn.getBoundingClientRect();
        x((e.clientX - r.left - r.width / 2) * .18);
        y((e.clientY - r.top - r.height / 2) * .3);
      });
      btn.addEventListener('pointerleave', () => { x(0); y(0); });
    });
  }

  // Fontes e imagens mudam alturas: recalcula os gatilhos quando tudo assenta.
  addEventListener('load', () => ST.refresh());
  document.fonts && document.fonts.ready.then(() => ST.refresh());
})();
