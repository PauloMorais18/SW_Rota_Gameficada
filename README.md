Comando para ler o db "npx prisma db pull"

# Rota Viva

MVP de turismo e rotas gamificadas com Vite, React, TypeScript, Tailwind, Prisma e PostgreSQL. Backend em funções Node da Vercel.

## Executar localmente

Com o banco e o `.env` configurados:

```bash
npm run dev
```

Acesse http://localhost:3000. O comando inicia o frontend Vite na porta 3000 e a API local na porta 3001. Encerre o servidor anterior antes de iniciar.

Na primeira instalação:

1. Execute `npm ci`.
2. Copie `.env.example` para `.env` e configure seu PostgreSQL e uma `SESSION_SECRET` aleatória com pelo menos 32 caracteres.
3. Execute `npm run db:generate`, `npm run db:migrate` e `npm run db:seed`.
4. Execute `npm run dev`.

## Publicar na Vercel

O deploy segue a mesma estrutura do projeto Kallyn: frontend Vite em `dist` e funções serverless na pasta `api`.

| Campo | Valor |
| --- | --- |
| Application Preset | Vite |
| Root Directory | `./` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | `npm ci` |

O arquivo `vercel.json` já declara essas configurações. O build gera o Prisma Client, verifica o TypeScript e cria `dist/index.html`. A Vercel publica o frontend e as funções `api/action.ts` e `api/data.ts` separadamente. O backend mantém autenticação, cookies HTTP-only, roles e acesso ao PostgreSQL. Não é um export estático do backend.

Envie também `package-lock.json`, `vite.config.ts`, `index.html`, `api/` e `src/server/` ao GitHub. Use o commit novo no deploy.

Em **Environment Variables**, configure:

| Variável | Valor |
| --- | --- |
| `DATABASE_URL` | URL de um PostgreSQL acessível pela Vercel, com os parâmetros SSL exigidos pelo provedor |
| `SESSION_SECRET` | Segredo aleatório de pelo menos 32 caracteres |
| `ALLOW_DEMO_LOGIN` | `false` para acesso normal; `true` somente para uma demonstração pública intencional |

O banco local (`localhost` ou `127.0.0.1`) não é acessível pela Vercel. Use um PostgreSQL hospedado. Essas variáveis são exclusivas do servidor: não use prefixos `NEXT_PUBLIC_` ou `VITE_`.

Antes do primeiro acesso, configure temporariamente o `.env` local com a URL do banco hospedado e execute:

```bash
npm run db:migrate
npm run db:seed
```

Isso cria as tabelas, a configuração da plataforma e os dados fictícios. As migrations e o seed não são executados automaticamente durante builds. Use bancos separados para Preview e Production. O arquivo `.env` está ignorado pelo Git.

Envie os arquivos ao GitHub e clique em **Create Project/Deploy** na Vercel. O HTTPS da Vercel permite geolocalização e instalação da PWA.

### Contas de demonstração

| Perfil | E-mail | Senha |
| --- | --- | --- |
| Visitante | `visitante@rota.demo` | `Demo@2026` |
| Estabelecimento | `parceiro@rota.demo` | `Demo@2026` |
| Admin | `admin@rota.demo` | `Demo@2026` |

O seed cria essas contas mesmo com `ALLOW_DEMO_LOGIN=false`. Para operação real, substitua suas senhas ou desative as contas de demonstração. Com `ALLOW_DEMO_LOGIN=true`, os botões de demonstração dão acesso inclusive ao administrador sem senha.

## Banco e integrações

- `prisma/schema.prisma`: modelos do banco.
- `prisma/migrations/202609120001_initial/migration.sql`: migration aplicada pelo Prisma.
- `migration.sql`: cópia do script inicial para execução manual alternativa. Não execute ambos no mesmo banco.
- As tabelas possuem `chave`, `ativo`, `datahoraalt` e `datahoracad`; triggers atualizam `datahoraalt` também em alterações SQL diretas.
- Lean Fleet: provider mock em `src/lib/lean-fleet.ts`, sem endpoints externos.
- Estrelas: estrutura de 0 a 5, data de expiração e placeholder em `src/lib/stars.ts`; nenhum cálculo por gastos foi definido.
- Visitas exigem GPS e conexão contínuos, com verificação periódica enquanto a tela está aberta. A API usa o relógio do servidor e transações para conceder pontos uma única vez.
- A PWA oferece uma tela offline. Visitas e operações autenticadas precisam de conexão.

## APIs utilizadas e mapa

| Serviço / biblioteca | Uso |
| --- | --- |
| **React Leaflet + Leaflet** | Componentes React para mapa, marcadores, círculos e Polyline. `leaflet` e `react-leaflet` estão em `dependencies`; `@types/leaflet` em `devDependencies`. |
| **OpenStreetMap** | Mapa base via `https://tile.openstreetmap.org/{z}/{x}/{y}.png`, com atribuição aos colaboradores e link para o copyright. Sem Google Maps e sem cache offline/prefetch de tiles. |
| **Geolocation API do navegador** | `watchPosition` durante uso da aplicação; solicita uma nova posição quando necessário para manter amostras recentes mesmo com o visitante parado. |
| **Supabase PostgreSQL / Prisma** | Persistência de locais, visitas, percurso e transações pelas funções `/api/*`. Credenciais ficam exclusivamente no servidor. |
| **Google OpenID Connect** | Login Google com Authorization Code + PKCE, state, nonce e validação de assinatura, issuer e audience no servidor. |

Referências: [React Leaflet](https://react-leaflet.js.org/), [OpenStreetMap — política de tiles](https://operations.osmfoundation.org/policies/tiles/), [Google OIDC](https://developers.google.com/identity/openid-connect/reference).

### Ativar as alterações no banco existente

Em `db/migration.sql`, localize **ATUALIZAÇÃO 202609130001: MAPA, GOOGLE E CONTAS DE TESTE**. Execute **somente desse marcador até o final** no SQL Editor se as tabelas iniciais já existem. Para um banco novo, execute o arquivo inteiro.

A migration incremental equivalente está em `prisma/migrations/202609130001_tracking_google/migration.sql`. Se o histórico Prisma já está em uso, aplique com `npm run db:migrate`, sem repetir a instalação inicial manual. Se aplicar o SQL incremental manualmente e já usar o histórico Prisma, marque-o como aplicado com `npx prisma migrate resolve --applied 202609130001_tracking_google`.

Foram reaproveitados Place, Visit, Route, RouteStop, RouteParticipation, LocationSample e PointTransaction. Nenhuma tabela duplicada foi criada. LocationSample ganhou vínculo de usuário/sessão/participação, data de captura do GPS e visita opcional para registrar o caminho fora dos estabelecimentos. O prazo de permanência continua usando timestamps do servidor. Place ganhou uma descrição informativa de recompensa especial, editável apenas pelo administrador, sem modificar o cálculo dos pontos.

O SQL mantém RLS, revoga acesso público às tabelas e cria as três contas fictícias dos atalhos com hash bcrypt da senha de teste `Demo@2026`. Não sobrescreve contas existentes. Os atalhos usam a API de demonstração e só aparecem com `ALLOW_DEMO_LOGIN=true`; a senha não é embutida no bundle frontend. Essa opção dá acesso aos perfis de teste, inclusive admin, por isso mantenha-a habilitada somente na demonstração.

### Usar o mapa

1. Entre como visitante e abra **Explorar → Mapa**.
2. Escolha uma rota (participe antes em **Rotas**) ou todos os locais.
3. Clique em **Ativar GPS** e permita a localização. Administradores, parceiros e visitantes sem login podem visualizar a própria posição sem gravar amostras ou iniciar visitas automáticas.
4. Ao entrar no raio com precisão suficiente, a visita mais próxima é iniciada. Ao cumprir o mínimo, o servidor conclui a visita e registra uma única transação de pontos. Saída do raio, tempo máximo ou interrupção acima do limite invalidam a visita.
5. O histórico já visitado aparece em verde; presença confirmada em amarelo; recompensa especial em roxo; demais locais em azul. Verde prevalece sobre amarelo, que prevalece sobre roxo.

O raio inclui a incerteza do GPS (`distância + precisão <= raio`). Gravações têm intervalo de aproximadamente 25 segundos, inclusive paradas, com limite também no backend. A Polyline usa apenas amostras persistidas do usuário e sessão atuais (até 2.000 pontos) e é interrompida em intervalos acima de 2 minutos. Trocar a rota ou a conta cria outra sessão; recarregar a página inicia uma nova sessão visual. Não há rastreamento de fundo com o app fechado. Uma visita histórica concluída não gera pontos repetidos durante a mesma sessão, e o intervalo de novas visitas premiadas continua controlado pelo admin.

Pausar o GPS cancela a visita que ainda estiver em andamento, sem apagar visitas concluídas ou pontos já recebidos. Para recomeçar depois de uma pausa, ative o GPS novamente.

GPS do navegador não é prova antifraude absoluta: posições podem ser simuladas no dispositivo. O MVP valida precisão, presença, amostras recentes e tempo no servidor, sem usar o relógio enviado pelo cliente para conceder pontos.

### Configurar login Google

1. No Google Cloud, configure a tela de consentimento OAuth e crie credenciais de **Aplicativo da Web**.
2. Cadastre como URI de redirecionamento `https://SEU-DOMINIO/api/google` (e `http://localhost:3000/api/google` para desenvolvimento).
3. Configure apenas no `.env` do backend e nas variáveis da Vercel: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`.
4. Reinicie o servidor local ou publique novo deploy. O botão fica disponível quando essas três configurações existem.

Novas contas Google recebem exclusivamente o perfil VISITANTE. Contas já cadastradas com senha não são vinculadas automaticamente pelo e-mail: devem continuar usando senha. A vinculação explícita de contas é uma extensão futura. Não há compartilhamento de tokens Google com o frontend. O teste completo com o provedor depende das suas credenciais OAuth; os testes locais validam state, cookie e PKCE sem chamar o Google.

## Verificação de código

```bash
npm test
npm run build
```

### Instalação do aplicativo (PWA)

No menu lateral (no celular, abra o menu compacto), clique em **Instalar aplicativo**. Chrome/Edge abrem a confirmação nativa quando o navegador disponibiliza a instalação. Se não houver um prompt disponível, uma janela explica como instalar pelo menu. No iPhone/iPad, abra no Safari e use Compartilhar → Adicionar à Tela de Início → Adicionar. A instalação depende da confirmação do usuário; não é um download de APK.

Para testar no aparelho, publique na Vercel e abra o endereço HTTPS no navegador. Confirme a instalação e abra o ícone Rota Viva: a aplicação deve aparecer em janela independente. No desktop, localhost também permite testar. Após cancelar, o navegador pode exigir a instalação pelo próprio menu. O app detecta a confirmação de instalação e a execução em modo standalone. O service worker oferece uma página offline; mapas, login e dados ainda precisam de conexão.

## Locais reais do OpenStreetMap

Servi�os Overpass e Taginfo, endpoints, funcionamento, estrutura e limita��es: [documenta��o da integra��o](docs/openstreetmap.md).

## Rastreamento da rota e geofence

Consulte [rastreamento e geofence](docs/tracking.md) para os controles Iniciar/Pausar/Encerrar, caminho em tempo real e regras de persist�ncia. Esta se��o substitui a descri��o anterior de Polyline composta apenas por pontos salvos no banco.

## Cupons de desconto

Fluxo de gera��o, QR Code, utiliza��o e estrutura do banco: [cupons de desconto](docs/coupons.md).
