# Cupons de desconto

No menu **Cupons**, o estabelecimento seleciona um local próprio aprovado, informa título, desconto percentual (1–100%), validade e limite de usos. **Exibir QR Code** mostra o código para apresentar no balcão. O painel informa utilizações por cupom, permite atualizar a contagem e desativar novas utilizações. Admin pode gerenciar todos os locais.

O visitante usa **Escanear QR Code**, permite a câmera, confere os dados e toca em **Confirmar uso do cupom**. Também pode usar a câmera nativa do celular: o link abre `?coupon=TOKEN#coupons` e solicita login quando necessário. Abrir o link não consome o desconto. O histórico pessoal exibe os usos confirmados. O desconto deve ser aplicado pela loja no atendimento; não há integração com caixa/pagamentos.

Cada visitante pode usar cada cupom uma vez. Validade, estado do cupom/estabelecimento e limite são verificados no servidor. Lock transacional no cupom serializa utilizações concorrentes; constraint única de cupom/usuário protege contra duplicações. Donos veem apenas seus cupons e contagens, sem dados pessoais dos visitantes. O QR usa token aleatório, mas pode ser fotografado ou compartilhado: este MVP não comprova presença física pelo QR nem associa cupons a pontos/estrelas. A contagem representa confirmações de uso, não compras verificadas.

Banco: tabelas `cupons` e `usos_cupons`, com `chave`, `ativo`, `datahoracad`, `datahoraalt`, FKs, índices, checks, RLS e acesso bloqueado para a Data API pública. Estrutura no `db/migration.sql`, seção **ATUALIZAÇÃO 202609140001: CUPONS**, e migration incremental em `prisma/migrations/202609140001_coupons/migration.sql`. Em outro banco existente, executar apenas essa migration incremental; não executar novamente a estrutura inicial. Modelos `Coupon` e `CouponUse` registrados no Prisma. Consultas atuais usam SQL parametrizado pelo Prisma.

API existente `/api/action`: `couponCreate`, `couponList`, `couponDisable`, `couponPreview`, `couponRedeem`, preservando autenticação HTTP-only, roles e validação de origem. Dependências `qrcode`, `qr-scanner` e `@types/qrcode`. A câmera requer HTTPS (Vercel) ou localhost; ao fechar a câmera/sair da seção, o scanner libera o dispositivo. Nenhuma imagem da câmera é enviada ao servidor.

Teste manual: criar um cupom, abrir o QR em outro aparelho com visitante autenticado, confirmar e atualizar contagem no painel da loja. Repetir com o mesmo visitante deve ser rejeitado. Desativar o cupom impede novos usos. Teste também câmera negada, validade vencida e limite esgotado.
