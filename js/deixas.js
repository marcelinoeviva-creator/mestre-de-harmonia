/* ============================================================
   deixas.js — a sessão como uma lista de deixas

   O roteiro achatado na ordem em que a sessão acontece: momentos em
   sequência, peças em sequência dentro de cada momento. Momentos sem
   peça (como o Saco de Propostas) simplesmente não entram.

   Sobre ela anda um ponteiro — "a próxima peça". Tocar avança o
   ponteiro; o operador só precisa de um botão durante a sessão, como
   nas mesas de teatro.

   O ponteiro é guardado pelo id da peça, não pela posição: assim ele
   sobrevive a reordenar, acrescentar ou apagar peças no roteiro.
   Funções puras, sem tela — de propósito, para poderem ser testadas.
   ============================================================ */

export const FIM = '__fim__';

/** [{ m, t }] na ordem da sessão. */
export function sequencia(state){
  const out = [];
  for(const m of state.moments){
    for(const id of m.trackIds){
      const t = state.tracks[id];
      if(t) out.push({ m, t });
    }
  }
  return out;
}

/** Posição do ponteiro na sequência.
    -1 quando o roteiro está vazio; seq.length quando chegou ao fim. */
export function posicao(seq, ponteiroId){
  if(!seq.length) return -1;
  if(ponteiroId === FIM) return seq.length;
  const i = seq.findIndex(x => x.t.id === ponteiroId);
  return i < 0 ? 0 : i;                 // ponteiro perdido (peça apagada): recomeça
}

/** Id a guardar como ponteiro para a posição i. */
export function idNaPosicao(seq, i){
  if(!seq.length) return '';
  if(i >= seq.length) return FIM;
  return seq[Math.max(0, i)].t.id;
}

/** Ponteiro depois de tocar a peça trackId: a seguinte, ou o fim. */
export function depoisDe(seq, trackId){
  const i = seq.findIndex(x => x.t.id === trackId);
  return i < 0 ? null : idNaPosicao(seq, i + 1);
}
