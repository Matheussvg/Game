# ⚔️ Reinos de Valoria

MMORPG multiplayer no navegador, inspirado em World of Warcraft, com **classes de combate**, **profissões** que movem a economia e um **sistema político** completo: candidaturas, debates públicos, eleições, rei, impostos, decretos e petições para derrubar o soberano.

Tudo roda com Node.js + WebSocket no servidor e Canvas 2D no cliente. Não usa arquivos de imagem: os gráficos são desenhados por código.

## Como jogar

```bash
npm install
npm start            # http://localhost:3000
```

Abra o endereço em vários navegadores ou máquinas para jogar com outras pessoas. Na tela inicial, escolha nome, senha e classe. Se o nome ainda não existir, a conta é criada.

| Variável | Efeito |
|---|---|
| `PORT` | Porta HTTP/WebSocket (padrão 3000) |
| `DATA_DIR` | Pasta onde o mundo é salvo (padrão `./data`) |
| `ELECTION_FAST=1` | Ciclo eleitoral acelerado (reinado de 3 min). `npm run dev` já usa essa opção |
| `ELECTION_DURATIONS` | Duração das fases em segundos: `reinado,candidatura,debate,votacao` (ex.: `1200,240,360,180`) |

O mundo (contas, personagens, mercado, contratos e estado do reino) é salvo a cada 30 s e ao desligar o servidor.

### Controles

| Tecla | Ação |
|---|---|
| `WASD` / setas | Mover |
| Clique / `Tab` | Selecionar alvo / próximo inimigo |
| `1`–`4` | Habilidades da classe |
| `5`–`8` | Poção de vida, poção de mana, comida, elixir |
| `E` | Falar com NPC ou coletar recurso |
| `C` `B` `P` `L` `O` `M` `H` | Personagem, Inventário, Profissão, Missões, Política, Mapa, Ajuda |
| `Enter` | Chat (`!texto` envia no chat Geral) |

Comandos de chat: `/w nome msg`, `/pagar nome qtd`, `/dar nome item qtd`, `/quem`, `/ajuda`.

## O mundo

```
            ❄ Montanhas de Ferro (7-12)        ☠ Ruínas Malditas (12-18)
                 Posto Avançado do Norte            Covil do Lich Morvath
  🌲 Bosque          ┃
  Sussurrante  ━━━ 🏰 VALORIA ━━━━━━━━━  🐊 Pântano Sombrio (6-9)
   (1-5)             ┃                          ┃
               🌾 Campos Dourados (2-6)  ━━━━  ⚓ Porto Sereno
                  Fazenda do Joaquim
```

- **Valoria, a Capital**: castelo e Trono, Praça do Fórum com púlpito de debates, Forja, Alquimia, Taverna, Salão das Guildas, Mercado e Quadro de Empregos.
- **12 tipos de monstro**, de Ratazanas Gigantes a Golems e Espectros, e um chefe: **Morvath, o Lich**, que solta itens lendários.
- **10 missões** com NPCs (marcados com `!` e `?`).
- Ciclo de dia e noite, minimapa e mapa do mundo.

## Classes

| Classe | Papel | Habilidades |
|---|---|---|
| **Guerreiro** | Corpo a corpo, resistente | Golpe Heroico, Investida (atordoa), Redemoinho (área), Grito de Batalha |
| **Mago** | Dano mágico à distância | Bola de Fogo, Lança de Gelo (lentidão), Nova Gélida (congela), Explosão Arcana |
| **Caçador** | Arqueiro | Tiro Certeiro, Tiro Múltiplo, Armadilha (prende), Tiro Mortal |
| **Sacerdote** | Cura e suporte | Castigo, Cura, Escudo Divino, Renovar (cura contínua) |

## Profissões

Escolha com a **Mestra das Guildas Helena**. A primeira escolha é grátis e as trocas seguintes custam 50 de ouro. A habilidade em cada ofício é guardada mesmo depois de trocar.

- ⚒️ **Ferreiro**: minera ferro, carvão e mithril (com o dobro de rendimento) e forja barras, armas e armaduras de Ferro, Aço e Mithril.
- 💰 **Mercador**: é o único que pode anunciar no **Mercado de Valoria**, e as vendas acontecem mesmo com ele offline. Também compra mercadorias por atacado e faz **rotas comerciais** entre Valoria, Porto Sereno e o Posto do Norte, onde os preços caem quando muita gente vende. Paga metade do imposto e recebe mais dos vendedores NPC.
- 🧹 **Empregado**: aceita **Tarefas Reais** pagas pelo Tesouro (entregas, patrulhas, coletas e caçadas) e cumpre **Contratos** publicados por outros jogadores, com o pagamento guardado em garantia. Pode ser nomeado **Guarda Real** pelo rei, ganhando salário e bônus de dano.
- ⚗️ **Alquimista**: faz poções de vida e mana, grandes poções e elixires.
- 🌾 **Fazendeiro**: colhe trigo e cozinha pão, ensopado e banquete.

Qualquer pessoa pode coletar recursos. A profissão ligada a cada recurso dobra o que é coletado.

## Política: o trono de Valoria

O reino segue um ciclo permanente:

1. **Reinado**: o soberano governa a partir do **Trono** e pode:
   - definir o **imposto** (0–30%), cobrado em toda venda e enviado ao Tesouro;
   - emitir **decretos**, que são anunciados a todos;
   - criar **recompensas** por monstros, pagas pelo Tesouro;
   - nomear e dispensar **Guardas Reais**;
   - organizar um **Festival Real** (+25% de XP por 5 min);
   - abdicar.
2. **Candidaturas**: com o **Arauto Real** (nível 3+, taxa de 50 de ouro), o candidato escolhe um **foco de governo** (Militar, Comércio, Artesãos ou Povo), um imposto proposto e um lema. Dois candidatos NPC sempre disputam.
3. **Grande Debate**: cinco temas em sequência (Impostos, Segurança, Economia, Povo e Considerações Finais). Os candidatos discursam do **púlpito da Praça do Fórum**, com balões de fala no mundo. O público faz perguntas, **aplaude** ou **vaia**.
4. **Votação**: cada jogador vota uma vez em Valoria. Além disso, 9 votos de **cidadãos NPC** são divididos pela popularidade, que depende de aplausos, vaias, participação e imposto proposto.

O vencedor é coroado e aplica seu imposto e seu foco, que dá bônus ao reino todo. Um rei impopular pode ser derrubado por uma **Petição de Desconfiança**, que abre eleições imediatamente.

## Estrutura

```
server/
  index.js      servidor HTTP + WebSocket
  game.js       loop do jogo, combate, IA, profissões, mercado, empregos, missões, chat
  politics.js   eleições, debate, votação, poderes do rei, petições
  world.js      geração procedural do mapa, NPCs, rotas comerciais, spawns
  data.js       classes, habilidades, itens, receitas, monstros, missões, falas dos candidatos
  storage.js    persistência em JSON e senhas com scrypt
public/
  index.html, style.css
  js/main.js    login, rede, entrada, previsão de movimento
  js/render.js  renderização (tiles e sprites procedurais, efeitos, minimapa)
  js/ui.js      HUD e painéis
test/
  game.test.js  testes de integração (npm test)
```

O servidor é autoritativo: valida movimento (velocidade e colisão), alcance, recarga, mana e distância dos NPCs, e calcula todo o combate, os saques e a economia.
