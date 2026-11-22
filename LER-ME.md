# MOMO 3D — FNAF Style (Navegador)

Jogo 100% 3D no estilo *Five Nights at Freddy's 1*, rodando no navegador com
**HTML5 + CSS + Three.js + GLTFLoader + Web Audio API**. Compatível com
**PC (mouse/teclado)** e **Mobile (toque/arraste)**.

## Conteúdo do pacote

- `index.html` — página do jogo
- `style.css` — estilos e telas (HUD, jornal, jumpscare, game over)
- `game.js` — motor do jogo (câmeras, IA da Momo, bateria, relógio, monitores)
- `momo_3d_model.glb` — modelo 3D oficial da **momo** (repositório conectado)
- `assets/img/jojo-poster.png` — pôster JoJo na parede (Imagem 1)
- `assets/img/newspaper-template.png` — molde do jornal de início (Imagem 2)
- `assets/img/favicon.png` — ícone/favicon e foto P&B no jornal (Imagem 4)
- `lib/three/` — biblioteca Three.js local (sem dependência de CDN)
- `abrir-no-navegador.bat` — atalho para abrir no Windows

## Como abrir (sem erro de CORS)

O navegador bloqueia modelos/texturas ao abrir `index.html` direto (`file://`).
Use um servidor local:

### Opção 1: Python (recomendado)
```bash
python -m http.server 8080
```
Acesse: `http://localhost:8080`

### Opção 2: Windows (.bat)
Dê duplo clique em `abrir-no-navegador.bat`.

### Opção 3: Node (se tiver http-server)
```bash
npx http-server -p 8080 -c-1
```
Acesse: `http://localhost:8080`

## Como jogar

1. **INICIAR** — desbloqueia o áudio e abre o menu 3D com a Momo.
2. **PLAY** — abre o jornal *"MOMO É REAL!!!"* (Imagem 2 com a Imagem 4 no centro).
3. Clique no jornal para começar a **Noite 1**.
4. Sobreviva das **12h às 6h** (relógio analógico anos 80 no topo direito).
5. Vire a câmera apenas para **esquerda/direita (até 45°)**:
   - PC: arraste o mouse ou teclas **← → / A D**
   - Mobile: arraste o dedo na tela
6. **Porta (esquerda)** e **Cortina (direita)** começam ABERTAS. Clique para fechar/abrir
   (cooldown de 2,5 s). Se a Momo estiver na entrada e você não fechar a tempo,
   ela dá **jumpscare 3D** com grito alto.
7. **Lanterna**: tecla **F** ou botão LANTERNA (ilumina o quarto e as entradas).
8. Clique no **notebook** da mesa para abrir o **monitor de 6 câmeras 3D**
   (CAM_01 a CAM_06: Sala, Cozinha, Quarto dos Pais, Corredores, Banheiro)
   com planta baixa, estática, ● REC piscando e botão de lanterna da câmera.
9. **Bateria 100%**: 4 barras (1 base + 1 por item ativo: lanterna, porta, cortina, monitor).
   Se chegar a 0%, fica tudo escuro até as 6h.

A Momo caminha pelos cômodos, fica mais rápida de noite 1 à noite 5, congela se
você estiver vendo-a pela câmera, observa 5 segundos na entrada e ataca.

## Créditos

Modelo 3D: `momo_3d_model.glb` do repositório `italomarques873ph-hash/momo-3d`.
Imagens fornecidas pelo usuário (JoJo pôster, jornal, quarto de referência, ícone).
