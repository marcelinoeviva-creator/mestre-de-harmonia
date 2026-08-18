# Mestre de Harmonia

## ▶ [ABRIR O APLICATIVO](https://marcelinoeviva-creator.github.io/mestre-de-harmonia/)

Toque no link acima **no Safari do iPad**, depois em Compartilhar → Adicionar à Tela de Início.

---

Painel de música para sessões maçônicas, feito para o **iPad 9ª geração / iPadOS 26**.

Aplicativo web instalável (PWA): abre em tela cheia pelo ícone, funciona sem internet
e não depende de Xcode, conta de desenvolvedor nem App Store.

---

## O que ele faz

**Roteiro organizado por momento do ritual.** Recepção, Abertura, Entrada do Venerável,
Deambulação, Cadeia de União, Encerramento, Ágape… Todos renomeáveis e reordenáveis.
Cada peça guarda link do Spotify, compositor e uma **anotação de execução** ("entrar no
3º golpe do malhete").

**Mesa de som de dois canais.** Decks A e B com fader de volume independente por canal,
fader mestre, fade de entrada e saída, e um botão de **transição A ⇄ B** que sobe uma
faixa enquanto a outra desce (3, 5, 8 ou 12 segundos). É assim que a próxima trilha entra
por baixo antes da primeira acabar.

**Botão SILÊNCIO.** Corta tudo na hora, inclusive o Spotify quando conectado.

---

## As duas fontes de som — e por que elas são diferentes

### Spotify (sua biblioteca)

Uma peça com link do Spotify toca com um toque. **O Spotify comanda um player só:
não existe forma — em nenhum aplicativo, de ninguém — de tocar duas músicas dele
simultaneamente.** A API oficial não permite e os termos de uso proíbem.

Sobreposição usando só Spotify, a única possível: ligue o **crossfade** dele em
*Spotify → Ajustes → Reprodução → Crossfade* (até 12 segundos) e enfileire as peças na ordem.

### Arquivos de áudio (decks A e B)

Peças com arquivo (MP3, M4A, WAV) vão para os decks e **tocam ao mesmo tempo, com
volume independente**. É a única forma de sobreposição real. Basta ter o arquivo das
poucas peças que você precisa cruzar — o resto do repertório pode continuar no Spotify.

O arquivo é importado uma vez e fica guardado dentro do app, no iPad. Não precisa de
internet para tocar.

---

## Instalar no iPad

1. Abra o endereço do app no **Safari** do iPad (não no Chrome).
2. Toque em **Compartilhar** (o quadrado com a seta para cima).
3. **Adicionar à Tela de Início** → **Adicionar**.
4. Abra pelo ícone. Entra em tela cheia, sem barra de navegador.

A partir daí ele funciona offline. Para atualizar, basta abrir o app com internet duas vezes.

---

## Conexão com o Spotify (opcional)

Sem configurar nada, o app já funciona: você cola links, o título é preenchido sozinho e
tocar abre o app do Spotify.

Conectar traz três ganhos: **importar playlists inteiras de uma vez**, **comandar o Spotify
sem sair do painel** e **controlar o volume dele pelo fader S**. Exige conta **Premium**.

1. Entre em <https://developer.spotify.com/dashboard> com sua conta Spotify.
2. **Create app**. Nome e descrição: qualquer coisa (ex.: "Mestre de Harmonia").
3. Em **Redirect URIs**, cole exatamente o endereço que aparece em *Ajustes* dentro do app.
4. Em **APIs used**, marque **Web API**. Salve.
5. Copie o **Client ID** e cole em *Ajustes → Client ID* → **Conectar Spotify**.

O Client ID é um identificador público, não uma senha. O login usa PKCE: sua senha do
Spotify nunca passa pelo app.

---

## Receber um roteiro pronto

Como a importação de playlists do Spotify é barrada pela API, o repertório pode ser
preparado fora do iPad e entregue pronto.

O roteiro nasce de `roteiro-fonte.txt`, uma linha por peça:

```
Momento :: link do Spotify :: anotação (opcional)
```

Os títulos e capas são buscados no build; não é preciso escrever o nome da música.

```bash
node tools/build-roteiro.mjs
```

Isso gera `roteiro.json`, que vai publicado junto com o app. No iPad:
*Ajustes → Receber roteiro → Somar ao meu*. Somar casa os momentos pelo nome, mantém o
que já estava montado e ignora peças repetidas — dá para receber quantas vezes quiser.

## Cópia de segurança

*Ajustes → Exportar roteiro* gera um JSON com momentos, peças, links e anotações.
Guarde no iCloud Drive. Os arquivos de áudio **não** vão no JSON — ficam só no iPad e
precisam ser reimportados se você trocar de aparelho.

---

## Limites conhecidos

- **Duas faixas do Spotify ao mesmo tempo: impossível.** Sobreposição real só entre os
  decks A e B, com arquivos de áudio.
- **O som dos decks para se você sair do app.** Um app web no iPadOS só toca em primeiro
  plano. Deixe o painel aberto durante a sessão — ele mantém a tela acesa sozinho enquanto
  houver som tocando.
- Controlar o Spotify de dentro do app exige Premium (limitação da API, não do app).

---

## Estrutura do código

```
index.html              telas e estrutura
css/app.css             estilo (alvo: 1080×810 em paisagem)
js/store.js             momentos, peças, backup, arquivos no IndexedDB
js/audio.js             mesa de som: dois decks, GainNode por canal, fades
js/spotify.js           links, oEmbed público, login PKCE, Web API
js/ui.js                diálogos, avisos, fader vertical
js/app.js               montagem e comportamento
sw.js                   funcionamento offline
icons/logo-src.png      emblema da Loja, original em alta resolução
icons/logo.png          emblema usado no cabeçalho e na marca d'água
icons/icon-*.png        ícone da tela de início, gerado a partir do emblema
```

O emblema é arte de traço escuro, então aparece sempre sobre um medalhão claro
(cabeçalho e ícone) ou invertido e apagado (marca d'água).

Sem dependências, sem build. Qualquer servidor de arquivos estáticos com HTTPS serve.

### Rodar localmente

```bash
python3 -m http.server 8791
```

Depois abra <http://localhost:8791>.
