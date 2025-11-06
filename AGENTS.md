# AGENTS.md — Guia Definitivo para Agentes neste Repositório

Este documento orienta agentes e colaboradores automatizados sobre como analisar, implementar e documentar funcionalidades na Ethnos_API. É prático e normativo: siga-o para manter consistência técnica, segurança e padronização.

## Visão Geral do Projeto
- Runtime: Node.js (>= 18)
- Framework: Express
- Entrada da aplicação: `src/app.js`
- Organização:
  - Rotas: `src/routes/`
  - Controladores: `src/controllers/`
  - Serviços: `src/services/`
  - DTOs (formatação de payloads): `src/dto/`
  - Middleware (erros, segurança, validação, paginação, monitoramento): `src/middleware/`
  - Utils (envelopes, paginação): `src/utils/`
  - Configuração do OpenAPI: `config/swagger.config.js`
- Documentação gerada: `docs/`

> Diretiva operacional: mantenha limpeza absoluta, clareza técnica, hierarquia e padronização em todo o repositório. Não versione artefatos gerados, logs, backups ou dumps. Remova conteúdos fora do escopo.

## Convenções de Resposta (Fonte de Verdade)
- Toda resposta deve utilizar o middleware `responseFormatter` (aplicado globalmente em `src/app.js`).
- Envelopes padronizados (ver `src/utils/responseBuilder.js`):
  - SuccessEnvelope: `{ status: 'success', data, pagination?, meta? }`
  - ErrorEnvelope: `{ status: 'error', message, code, timestamp, meta? }`
- Paginação obrigatória para listagens: use `createPagination/normalizePagination` de `src/utils/pagination.js`.
  - Suporte simultâneo a `page/limit` e `offset/limit`.

## Segurança e Acesso Interno
- Endpoints protegidos exigem header `X-Access-Key` (case-insensitive: `x-access-key`, `x-internal-key`, `x-api-key`).
- Middleware: `src/middleware/accessKey.js`.
  - Guardas:
    - `requireInternalAccessKey` tenta, nesta ordem: `API_KEY`, `INTERNAL_ACCESS_KEY`, `SECURITY_ACCESS_KEY`, `API_ACCESS_KEY`, `ETHNOS_API_KEY`, `ETHNOS_API_ACCESS_KEY`, `API_SECRET_KEY`.
    - `createAccessKeyGuard` para contextos específicos (permite configurar lista de variáveis aceitas).
- Integração frontend: o proxy autenticado do frontend lê `/etc/next-frontend.env` e envia `X-Access-Key` compatível com `API_KEY` do backend.
- Documentação OpenAPI define `securitySchemes.XAccessKey`.

## Padrões de Desenvolvimento
- Validação: `express-validator`. Centralize regras próximas à rota.
- Formatação de dados: utilize os DTOs por domínio (ex.: `work.dto.js`, `person.dto.js`, `organization.dto.js`, `venue.dto.js`, `course.dto.js`, `instructor.dto.js`).
- Erros: prefira `res.fail(...)` e `res.error(err, ...)` com `ERROR_CODES` de `src/utils/responseBuilder.js`.
- Paginação: sempre normalize os parâmetros e retorne `pagination` no envelope quando for listagem.
- Data access: use SQL direto via `sequelize.query` (sem modelos ORM). Tome o schema `database/schema_data_updated.sql` como fonte e evite divergência.
- Rate limiting: ativado por padrão. Ajuste via env em `/etc/node-backend.env`:
  - `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_GENERAL`, `RATE_LIMIT_SEARCH`, `RATE_LIMIT_METRICS`, `RATE_LIMIT_RELATIONAL`.
  - Slowdown: `SLOW_DOWN_AFTER`, `SLOW_DOWN_DELAY`, `SLOW_DOWN_MAX`.
  - Cabeçalhos `RateLimit-*` são enviados; bloqueio de IP não é aplicado.

## Documentação (OpenAPI)
- UI: `/docs` (Swagger UI) — fonte em `/docs.json`.
- Especificação JSON: `GET /docs.json` (gerada de `config/swagger.config.js` + anotações JSDoc nas rotas quando existentes).
- Especificação YAML: `GET /docs.yaml` (aliases: `/openapi.yaml`, `/openapi.yml`) — arquivo em `docs/swagger.yaml`.
- Geração via scripts (preferencial):
  - `npm run docs:generate` → `docs/swagger.json` e (opcional) `docs/swagger.yaml` se o pacote `yaml` estiver instalado.
  - `npm run docs:generate:yaml` → força geração do `docs/swagger.yaml` a partir de `config/swagger.config.js`.
  - Após mudanças: confirme a contagem de operações (`node -e "..."`) e atualize o README.
- Ao criar/alterar endpoints:
  - Atualize anotações JSDoc nas rotas (quando aplicável) e/ou `config/swagger.config.js` (componentes, schemas reutilizáveis, parâmetros globais).
  - Assegure-se que listagens documentem `page`, `limit` e `offset` com observação de uso simultâneo.
  - Use `$ref` para `SuccessEnvelope`, `ErrorEnvelope` e `Pagination`.

## Mapeamento de Categorias (Tags)
Siga a taxonomia exposta em `src/app.js` e refletida na documentação:
- Search & Discovery
- Academic Works
- Researchers
- Institutions
- Academic Venues
- Courses & Teaching
- Bibliography & Analysis
- Metrics & Analytics
- Security
- Health

## Execução e Ambientes
- Arquivo de ambiente (produção): `/etc/node-backend.env` (preferencial). Testes usam `.env.test`.
- Desenvolvimento: `npm run dev`
- Local: `npm start`
- Produção (PM2):
  - NPM scripts: `npm run start:pm2` / `npm run restart:pm2` / `npm run stop:pm2`
  - Deploy completo: `npm run deploy`
  - PM2 direto: `pm2 start ecosystem.config.js --env production`, `pm2 restart ethnos-api --update-env`, `pm2 save`, `pm2 logs ethnos-api`
  - Startup systemd: `pm2 startup` (seguir instruções), depois `pm2 save`.
- Entradas úteis:
  - Saúde do sistema: `/health`, `/health/ready`, `/health/live`, `/health/metrics` (chaves internas exigidas exceto `/live`).
  - Busca: `/search/*` (Sphinx habilitado/rollback ver `services/sphinxHealthCheck.service`).

## Higiene do Repositório
- Ignorar/limpar sempre: `logs/`, `coverage/`, `venv/`, `backup/`, `database/*.sql`, `node_modules/` (dependências), arquivos binários/temporários.
- Pastas válidas: `src/`, `config/`, `tests/`, `docs/` (apenas Swagger e guias técnicos em vigor), `scripts/`, `models/` (se aplicável), `ssl/` (quando necessário).
- Evitar documentação defasada ou fora de escopo (ex.: templates genéricos não utilizados). Remover quando identificar.
- Antes de abrir PR: executar limpeza e regenerar Swagger.

## Estilo de Código e Comentários
- Política estrita de comentários:
  - É proibido manter comentários, anotações e afins em códigos, scripts, testes e congêneres.
  - Exceções únicas: anotações de especificação Swagger JSDoc nas rotas e comentários estritamente indispensáveis ao contexto operacional imediato.
  - Proibidos: TODO, FIXME, HACK, NOTE, BUG, XXX, trechos de código comentados, blocos desativados e explicações redundantes.
- Remova trechos obsoletos e código comentado.
- Comentários necessários devem ser mínimos, objetivos e temporais (reavaliar e remover na primeira oportunidade).
- Comentários de especificação (Swagger JSDoc) são parte funcional e devem permanecer atualizados.
- Mantenha mensagens de log objetivas; evite ruído.

## Estado Atual dos Endpoints
- Total documentado atualmente: 57 operações (contadas em `docs/swagger.json`).
- Endpoints desativados nesta distribuição (não montados em `src/app.js`):
  - `/signatures` (rota raiz)
  - `/subjects` (rota raiz)
- Observação: endpoints aninhados como `/persons/{id}/signatures` permanecem ativos.

Mantenha README.md e este AGENTS.md alinhados com o estado real:
- Ao alterar rotas, atualize o número total de endpoints no README a partir do OpenAPI.
- Evite números rígidos em títulos (ex.: “(10 endpoints)”) — preferir listas sem contagem fixa.

## Testes
- Framework: Jest + Supertest (sem abrir sockets; invocação direta dos handlers com mocks).
- Comandos:
  - `npm test` (rápido; variável `JEST_FAST=1`)
  - `npm run test:watch`
  - `npm run test:coverage`
- Os testes validam: envelopes, paginação, metadados e contratos dos endpoints públicos usando mocks de serviços.

Recomendações adicionais de manutenção de documentação
- Gere e publique `docs/swagger.json` e `docs/swagger.yaml` após mudanças em rotas.
- Confirme que descrições informativas no Swagger (ex.: rate limiting habilitado/desabilitado) refletem a configuração atual.

## Estrutura de Rotas Principais
- Works: `src/routes/works.js`
- Persons: `src/routes/persons.js`
- Organizations: `src/routes/organizations.js`
- Venues: `src/routes/venues.js`
- Search: `src/routes/search.js`, `src/routes/sphinx.js`
- Metrics/Dashboard: `src/routes/metrics.js`, `src/routes/dashboard.js`
- Citations/Collaborations: `src/routes/citations.js`, `src/routes/collaborations.js`
- Courses/Instructors/Bibliography: `src/routes/courses.js`, `src/routes/instructors.js`, `src/routes/bibliography.js`
- Security/Health: `src/routes/security.js`, `src/routes/health.js`

## Quando Adicionar um Novo Endpoint
1. Rota: crie no arquivo em `src/routes/` correspondente à categoria.
2. Validação: use `express-validator` e handlers auxiliares (`enhancedValidationHandler` quando disponível).
3. Controller/Service: isole lógica de dados em `src/services/`; aplique DTOs antes de responder.
4. Envelope: responda via `res.success(...)` ou `res.fail(...)`/`res.error(...)`.
5. Paginação: normalize e retorne `pagination` para coleções.
6. Segurança: se interno/admin, proteja com `requireInternalAccessKey`.
7. Documentação: atualize JSDoc da rota e gere docs com `npm run docs:generate`; se mantiver manual, sincronize `docs/swagger.yaml`.

## Padrões de Código
- Linguagem: JavaScript (CommonJS). Não adicionar padrão alternativo (ESM) sem necessidade explícita.
- Formatação: mantenha o estilo existente; não introduza linters/formatters sem consenso.
- Comentários em linha: apenas quando extritamente necessário. Evite.
- Nomes: descritivos; evite uma letra só.
- Logs: use o logger central (ver `src/middleware/errorHandler.js`).

## Variáveis de Ambiente Essenciais
- Arquivo padrão (produção): `/etc/node-backend.env`.
- Chaves de acesso: `API_KEY` (prioritária e compatível com o frontend), `INTERNAL_ACCESS_KEY`, `SECURITY_ACCESS_KEY`, `API_ACCESS_KEY` etc.
- `CORS_ORIGINS` — origens permitidas (fallback definido em `src/app.js`).
- Banco/Cache/Search: ver `src/config/database`, `src/config/redis`, e serviços Sphinx em `src/services/`.

## Documentação Servida
- Swagger UI: `GET /docs`
- OpenAPI JSON: `GET /docs.json`
- OpenAPI YAML: `GET /docs.yaml` (também em `/openapi.yaml`/`/openapi.yml`)
- Artefatos: `docs/swagger.json`, `docs/swagger.yaml`

## Scripts Úteis
- `scripts/generate-swagger.js` — gera `docs/swagger.json` e `docs/swagger.yaml` (se `yaml` instalado).
- `scripts/manage.sh` — utilidades operacionais (deploy, testes, Sphinx, geração de docs).
  - Sphinx: `scripts/manage.sh sphinx start|stop|status`
    - `start` valida conflito de portas (9312/9306). Se já em uso, use `sphinx stop` ou `sphinx start --force` (encerra o processo ocupante e inicia).
    - `stop` tenta encerrar via PID do `config/sphinx-unified.conf`; se o PID não existir, realiza fallback por portas/processo para evitar loops de "bind() failed".
  - Indexador: `scripts/manage.sh index` (todos) e `scripts/manage.sh index:fast` (apenas `works_poc` e `persons_poc`).
- SQL/Correções de dados de venues: `scripts/*.sql`, `scripts/fix-venue-data.js` etc.
- Índices de performance (works): `docs/db_indexes_works_performance.sql` — cria índices para acelerar `/works/{id}` (publications, authorships, work_subjects, funding, publication_files). Execute no banco para aplicar.

## Notas de Robustez (Venues)
- Detalhes de venue (`GET /venues/{id}`): reforçamos o fallback do enriquecimento para evitar 404 falsos quando tabelas opcionais não existem no ambiente (ex.: `organizations`, `venue_subjects`, `venue_yearly_stats`). O fallback agora consulta apenas a tabela `venues` quando necessário, removendo joins opcionais.
- Listagem e busca (`GET /venues`, `GET /venues/search`): os fallbacks também foram ajustados para não depender de `JOIN organizations` — campos de publisher retornam `null` quando a tabela não está disponível.
- Ao estender consultas, mantenha o fallback “mínimo” sem `JOIN`s para garantir que a ausência de tabelas opcionais não gere 404 ou 500 para registros existentes.

## Campos de Métricas e Identificadores em Venues
- O DTO de venues agora expõe, quando disponíveis na tabela `venues`:
  - Identificadores: `scopus_id`, `wikidata_id`, `openalex_id`, `mag_id` (além de `identifiers.scopus_source_id`, `issn`, `eissn`).
  - Métricas: `cited_by_count`, `h_index`, `i10_index`, `two_year_mean_citedness` (mapeado de `2yr_mean_citedness`).
  - Flags: `is_in_doaj`, `is_indexed_in_scopus`, `open_access`.
- Esses campos aparecem tanto em listagens quanto em detalhes. Métricas legadas (ex.: `impact_factor`, `sjr`, `snip`, `citescore`) permanecem opcionais; no endpoint de detalhes, por padrão `include_legacy=true` para maximizar completude.

## Padrões do Endpoint de Detalhes (Completo por padrão)
- `GET /venues/{id}` inclui por padrão: `subjects`, `yearly_stats`, `top_authors`, `recent_works` e `legacy_metrics` (podem ser desativados via query: `include_subjects=false`, `include_yearly=false`, `include_top_authors=false`, `include_recent_works=false`, `include_legacy=false`).
- `publication_summary` utiliza `venue_yearly_stats` quando disponível para inferir anos mínimo/máximo; caso contrário, usa `coverage_start_year`/`coverage_end_year`.

## Notas de Detalhes de Works
- `GET /works/{id}` é o endpoint de detalhes completo: inclui autores com afiliações, publicação (snapshot mais recente), arquivos, licenças, métricas, assuntos, financiamento, citações e referências.
- Citações e referências são incluídas no payload e também expostas em endpoints dedicados com paginação: `GET /works/{id}/citations` e `GET /works/{id}/references`.
- Para performance, títulos/anos/venue/autores utilizados nas listas de citações e referências são hidratados via `sphinx_works_summary` quando disponível.
- Identificadores (doi, pmid, pmcid, arxiv, wos_id, handle, wikidata_id, openalex_id, mag_id) residem em `publications` e são agregados no campo `identifiers` (arrays) e refletidos nos campos de topo quando disponíveis.
- Financiamento: dados vêm da tabela `funding` unida a `organizations` (campos: `funder_id`, `funder_name`, `grant_number`, `program_name`, `amount`, `currency`).
- Afiliações: retornadas por autor em `authors[].affiliation` (normalizadas), derivadas de `authorships.affiliation_id` → `organizations`.

## Checklist para Revisões por Agentes
- [ ] Rotas/validadores adicionados/alterados no arquivo correto.
- [ ] Uso de DTOs e `responseFormatter` garantido.
- [ ] Paginação em listagens com `page`, `limit` e `offset` documentados e suportados.
- [ ] Endpoints internos protegidos com `X-Access-Key`.
- [ ] Documentação OpenAPI atualizada (JSDoc e/ou `config/swagger.config.js`) e artefatos regenerados.
- [ ] Testes locais passam (`npm test`).
- [ ] Logs/métricas preservados; sem abrir sockets em testes.
- [ ] Varredura de comentários concluída; sem TODO/FIXME/HACK/NOTE/BUG/XXX, sem código comentado em `src/`, `scripts/`, `config/`, `tests/`.

## Referências Rápidas
- Envelopes: `src/utils/responseBuilder.js`
- Paginação: `src/utils/pagination.js`
- Acesso interno: `src/middleware/accessKey.js`
- Monitoramento: `src/middleware/monitoring.js` e serviços Sphinx associados

Manter este guia sincronizado faz parte do trabalho do agente ao tocar endpoints, contratos ou documentação.
- Consultas e Desempenho (Views/Índices)
- Prefira usar views materializadas/otimizadas quando disponíveis para contagens e agregações:
  - `v_person_production` — métricas e janela de publicação por pesquisador
  - `v_institution_productivity` — produtividade institucional e janelas de anos
  - `v_venue_ranking` — rankings/estatísticas de venues
  - `v_annual_stats` — séries anuais agregadas
  - `v_collaborations` — colaborações/coautorias
  - `v_works_by_signature` — mapeamento works ↔ assinaturas
  - `v_doi_venue_map` — mapeamento DOI → venue
- Índices úteis existentes (verificados no DB):
  - FULLTEXT `ft_works_content` em `works(title,subtitle,abstract)`
  - FULLTEXT `ft_persons_names` em `persons(preferred_name,given_names,family_name)`
  - `idx_publications_work_year`, `idx_authorships_person_role`, `idx_authorships_work_role_position`, `idx_venues_type_impact`, `uq_name_type`, `issn`, `eissn`
- Valide planos com `EXPLAIN` e ajuste filtros/ordenação para usar índices.
