# Redoma · Simulador de loteria

Simulação 3D em HTML, CSS e JavaScript, com Three.js e física de corpos rígidos Rapier.

## Executar

Requer Node.js 22 ou superior.

```sh
npm ci
npm start
```

Abra http://localhost:8080. O arquivo de lock fixa as versões e integridades das dependências. O comando de instalação copia as dependências para `public/vendor`. Depois disso, o aplicativo funciona sem CDN. Para hospedar, publique todo o diretório `public`, incluindo `vendor`.

## Usar

Escolha de **1 a 100 bolas** e de **1 até o total de bolas** como quantidade de números sorteados. Clique em **Aplicar e preparar** e depois em **Iniciar sorteio**. O padrão é 25 bolas e 15 extrações, sem reposição. As quantidades ficam bloqueadas durante o sorteio. **Novo sorteio** reinicia com a configuração aplicada.

Arraste para orbitar a câmera e use a roda do mouse para aproximar. Há pausa, controle de velocidade e resultados em ordem de extração.

## Como o resultado surge

Cada bola é um corpo rígido com gravidade, massa, colisão, atrito, restituição, rotação e resistência do ar. Um rotor recebe torque limitado; duas comportas formam uma câmara de extração. Se as bolas formarem um bloqueio sobre a saída, o motor alterna o sentido de rotação para desfazer o agrupamento por contato físico. Esse controle é uma solução do simulador, não uma alegação sobre o mecanismo exato da CAIXA. O número só é registrado quando a bola inteira cruza a extremidade do tubo de saída. As bolas extraídas continuam na simulação e caem na bandeja.

Não há seleção por índice aleatório, embaralhamento dos resultados, teletransporte ou força direcionada ao número vencedor. `crypto.getRandomValues` perturba apenas as condições iniciais. Os testes podem fornecer uma semente para reproduzir uma execução. O motor numérico calcula a física: uma simulação digital não dispensa cálculos e não representa aleatoriedade física verdadeira.

## Fidelidade e limites

Modelo inspirado em um globo mecânico de loteria, **não uma réplica certificada do equipamento da CAIXA**. As bolas usam diâmetro de 50 mm e massa de 66 g; dimensões do globo, pás, comportas, coeficientes de contato e torque são parâmetros aproximados. Não inclui deformação da borracha nem dinâmica completa de fluidos. Também não garante distribuição estatística uniforme nem serve para prever resultados oficiais.

A física usa unidades SI, passo fixo de 1/240 s, detecção contínua de colisões e solver iterativo. Corpos em repouso podem dormir automaticamente e voltam a reagir ao receber contatos; o rotor permanece ativo. A velocidade de reprodução altera o número de passos, nunca o tamanho do passo físico. Se houver saída fora do ciclo ou perda de confinamento, a execução sinaliza falha em vez de fabricar resultados. O tempo de extração depende dos encontros físicos e pode variar.

## Verificação

```sh
npm test
```

Inclui validação de configuração, gravidade, conservação de momento em colisão elástica, extrações sem repetição, saída completa, pausa, reinício e independência dos rótulos. O GitHub Actions executa os testes a cada envio. O estado real das execuções está na aba Actions. Após aprovação, o artefato `redoma-static` contém a página pronta para hospedagem, com as bibliotecas incluídas (retenção de 30 dias).

## Arquivos

- `public/physics.js`: máquina, corpos rígidos, controle das comportas e detecção de saída.
- `public/app.js`: cena 3D, câmera e interface.
- `public/index.html`, `public/styles.css`: página e apresentação.
- `scripts/vendor.mjs`: copia as bibliotecas instaladas pelo npm e suas licenças.
- `server.mjs`: servidor estático local.
- `tests/physics.test.mjs`: verificações automatizadas.

Bibliotecas: [Three.js](https://threejs.org/) (MIT) e [Rapier](https://rapier.rs/) (Apache-2.0). As licenças são preservadas em `public/vendor` na instalação.
