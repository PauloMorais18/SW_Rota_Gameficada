# Locais reais do OpenStreetMap

## Serviços e APIs utilizadas

- `src/services/overpassService.ts`: POST `https://overpass-api.de/api/interpreter`, formulário `data` com Overpass QL. Consulta `nwr(around:raio,latitude,longitude)["chave"]` para shop, amenity, tourism, leisure, historic e craft. Saída `out center tags` inclui centros de ways/relations. [Referência Overpass](https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL).
- `src/services/taginfoService.ts`: GET na base `https://taginfo.openstreetmap.org/api/4`. Métodos `searchByKeyword` → `/search/by_keyword?query=...`, `searchByKeyAndValue` → `/search/by_key_and_value?query=shop%3Dbakery`, `keyValues` → `/key/values?key=shop`, `keyOverview` → `/key/overview?key=shop`. Buscas paginadas limitadas a 20 resultados. Taginfo fornece metadados, nunca localização. [Documentação Taginfo](https://taginfo.openstreetmap.org/taginfo/apidoc).
- React Leaflet continua renderizando o mapa com `TileLayer` em `https://tile.openstreetmap.org/{z}/{x}/{y}.png`, com atribuição aos colaboradores do OpenStreetMap. Nenhuma chave de API é necessária.

## Funcionamento

Em Explorar → Mapa, ative o GPS. A camada “Locais reais próximos (OSM)” busca ao redor da posição recebida, com raio padrão de 1000 m e opções de 500 a 3000 m. Arrastar o mapa não dispara consultas. A primeira consulta aguarda 800 ms; seguintes exigem ao menos 30 segundos e deslocamento de 250 m após a última busca bem-sucedida. Mudanças de raio respeitam também o limite do serviço. Há apenas uma chamada Overpass em andamento, deduplicação de chamadas iguais e cache em memória de cinco minutos (até 12 consultas). O Taginfo usa cache de uma hora (até 30 consultas), incluindo chamadas em andamento.

Selecionar uma categoria filtra os POIs localmente e consulta os valores mais usados no Taginfo, disponíveis em “Categorias OSM disponíveis”. Selecionar uma rota mostra apenas seus locais cadastrados, ocultando a camada de descobertas OSM.

O componente `src/components/osm-nearby.tsx` integra controles, acompanhamento da posição e marcadores a `travel-map.tsx`. Respostas antigas são ignoradas após alterações ou desmontagem. Consultas falhas aguardam o intervalo antes de nova tentativa. Fechar o mapa interrompe o agendamento; a chamada já enviada pode terminar para alimentar o cache.

## Estrutura normalizada

`{ id, osmType, name, latitude, longitude, category, subcategory, address, phone, website, openingHours, tags }`

`id` combina tipo e identificador (`node/123`, `way/123`, `relation/123`). `osmType` é node, way ou relation. `category` é uma das seis chaves e `subcategory` é seu valor OSM. Campos textuais ausentes ficam vazios; o popup informa quando não há nome. `tags` preserva valores textuais originais. Latitude/longitude usam o nó ou `center`; valores ausentes, infinitos ou fora dos limites são descartados. Endereço usa `addr:full` ou partes `addr:*`; telefone e site também aceitam `contact:*`.

Objetos repetidos são deduplicados pelo tipo/ID. Um ponto OSM com nome igual a um estabelecimento cadastrado a menos de 40 m é ocultado em favor do cadastro, sem vincular visitas automaticamente. Diferentes objetos OSM podem representar a mesma entidade; não se mesclam objetos de nomes semelhantes indiscriminadamente.

## Gamificação, privacidade e limitações

Supabase, Prisma, autenticação, amostras de GPS, rotas e transações permanecem intactos. POIs não são inseridos no banco nem ganham recompensas ou visitas automaticamente. Eles são azuis, sem visita registrada na plataforma; não se inventa um raio de validação para esses objetos. Os cadastros continuam usando azul/amarelo/verde/roxo conforme suas regras existentes.

Consultas públicas são feitas diretamente pelo navegador e enviam coordenadas à Overpass. Nenhum secret é utilizado ou exposto. O checkbox permite desligar a camada. Não há armazenamento persistente dessas consultas ou cache offline dos tiles. A integração funciona no localhost e no frontend publicado na Vercel sem novas funções ou migrations.

Serviços comunitários têm limites e podem apresentar dados incompletos/desatualizados, lentidão, bloqueio CORS/rede, HTTP 429 ou indisponibilidade. Overpass tem timeout de consulta de 20 s e de rede de 25 s; Taginfo, 10 s. Erros e respostas parciais com `remark` são tratados sem substituir por locais fictícios. Resultados anteriores podem continuar visíveis com o aviso de falha; representam a última busca bem-sucedida. Há loading, aviso de GPS ausente e tentativa manual. O mapa e os cadastros continuam independentes desses serviços. Grandes áreas urbanas podem retornar muitos marcadores; o raio é limitado a 3 km para conter carga. Centros de áreas não representam necessariamente a entrada do local. Horários são exibidos no formato OSM, sem inferir se está aberto. Links externos aceitam apenas HTTP/HTTPS.

## Validação

`npm test` cobre normalização, coordenadas inválidas, centros, IDs, query, cache e parâmetros Taginfo. Para validar no aparelho: abra Mapa, permita GPS e confira POIs, popups e filtros; desative a camada e selecione uma rota para verificar a preservação dos cadastros. Negue GPS ou simule rede offline para verificar mensagens. APIs externas podem variar independentemente do build.
