# Ethnos_API - Academic Bibliography API v2.0.0

[![DOI](https://zenodo.org/badge/1049971688.svg)](https://doi.org/10.5281/zenodo.17049435)

Public RESTful API for academic bibliographic research with high-performance search capabilities, comprehensive researcher profiles, institutional analytics, and advanced bibliometric analysis.

## System Status

Production-ready secure system with **57 functional endpoints** (per current OpenAPI spec), comprehensive security audit completed, professional code standards implemented, and advanced Sphinx search integration delivering ~18–26ms query execution with automatic MariaDB fallback.

## Data Statistics

- **2,625,018** academic works indexed
- **1,458,013** researcher profiles
- **287,620** institutional organizations
- **1,328** academic venues (journals, conferences)

## Technology Stack

- **Backend**: Node.js + Express.js
- **Database**: MariaDB with optimized queries and views
  - Data access via direct SQL using a Sequelize connection (no ORM models); aligned to live schema in `database/schema_data_updated.sql`.
- **Search Engine**: Sphinx 2.2.11 with 7 operational indexes
- **Cache**: Redis v7.0.15 with intelligent TTL management
- **Documentation**: OpenAPI 3.0 specification with Swagger UI
- **Testing**: Jest with socket-free router invoker (no open ports); comprehensive contract tests for public endpoints; runs in-band via `npm test`
- **Monitoring**: Winston with structured logging and real-time metrics
- **Security**: Production-ready security audit completed

## Prerequisites

- Node.js >= 18.0.0
- MariaDB >= 10.5
- Redis >= 6.0 (optional for caching)
- Sphinx 2.2.11 (for high-performance search)

## Installation

1. Clone repository and install dependencies:
```bash
git clone https://github.com/bzuer/ethnos_api
cd api
npm install
```

2. Configure environment variables (runtime source):
```bash
sudo cp .env.example /etc/node-backend.env
sudo chown $(whoami) /etc/node-backend.env
```

3. Ajuste `/etc/node-backend.env` (fonte única carregada pela aplicação; utilize `.env.example` apenas como referência). Exemplo:
```env
# Database Configuration (Required)
DB_HOST=localhost
DB_PORT=3306
DB_NAME=your_database_name
DB_USER=your_database_user
DB_PASSWORD=your_secure_password

# Security Configuration
NODE_ENV=production
DB_SSL=true

# Cache Configuration (Optional)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password

# Application Configuration
PORT=3000
API_VERSION=v1
```

4. Start server via daemon script (desenvolvimento/local/produção):
```bash
./server.sh start
```

5. Desenvolvimento com hot reload (opcional):
```bash
npm run dev
```

## Project Structure

```
/api
  /src
    /config         # Database, Redis, application configuration
    /models         # Sequelize data models
    /controllers    # HTTP request handlers
    /routes         # Route definitions and middleware
    /middleware     # Authentication, validation, error handling
    /services       # Business logic layer
  /tests           # Automated test suites
  /logs            # Application logs with daily rotation
  server.sh        # Server management script
```

## Server Management

```bash
./server.sh start     # Start server with automatic cleanup
./server.sh restart   # Restart with complete process cleanup
./server.sh stop      # Stop server gracefully
./server.sh status    # Check server status and health
./server.sh cleanup   # Manual process and port cleanup
```

### Deployment automation

```bash
npm run deploy        # Orchestrates stop → cleanup → install → docs → reindex → test → restart via server.sh
```

## API Documentation

- **Base URL**: `http://localhost:3000`
- **Interactive Documentation**: `http://localhost:3000/docs`
- **OpenAPI Specification**: `http://localhost:3000/docs.json`
- **OpenAPI YAML**: `http://localhost:3000/docs.yaml` (aliases: `/openapi.yaml`, `/openapi.yml`)
- **Total Endpoints**: 57 documented endpoints
- **Authentication**:
  - Endpoints públicos: não exigem autenticação.
  - Endpoints internos (ex.: `/health`, `/security`, `/metrics` restritos): exigem header `X-Access-Key` com valor igual a `API_KEY` (ou chaves alternativas configuradas) no arquivo de ambiente.
  - Frontend usa proxy autenticado (same-origin) e envia `X-Access-Key` lendo `/etc/next-frontend.env`.

### Environment management
- Runtime (todas as execuções): `/etc/node-backend.env`
- Testes: `.env.test` (isolado para Jest)
- Utilize `.env.example` apenas como referência ao preencher o arquivo do `/etc`

## Main API Categories

### Search & Discovery
Advanced search with Sphinx engine
- `GET /search/works` - Primary works search with MariaDB fallback
- `GET /search/sphinx` - Direct Sphinx search (~18–26ms query execution)  
- `GET /search/advanced` - Faceted search with filters
- `GET /search/autocomplete` - Intelligent search suggestions
- `GET /search/global` - Global system search
- `GET /search/organizations` - Organization search
- `GET /search/persons` - Researcher search
- `GET /search/popular` - Popular content discovery
- `GET /search/sphinx/compare` - A/B performance testing
- `GET /search/sphinx/status` - Search engine monitoring

### Academic Works
Publications and citations analysis
- `GET /works` - Work listings with author integration
- `GET /works/{id}` - Complete work details with metadata
- `GET /works/{id}/citations` - Citation network analysis
- `GET /works/{id}/references` - Reference analysis
- `GET /works/{id}/authors` - Author information

### Researchers & Authors
Researcher profiles and collaboration networks
- `GET /persons` - Researcher listings
- `GET /persons/{id}` - Complete researcher profiles
- `GET /persons/{id}/works` - Author publication history
- `GET /persons/{id}/collaborators` - Collaboration network analysis
- `GET /persons/{id}/signatures` - Name signature variations
- `GET /persons/{id}/network` - Academic network mapping
- `GET /authors` - Alias endpoint for persons
- `GET /author` - Alternative alias endpoint

### Institutions
Academic organizations and affiliations
- `GET /organizations` - Institution listings
- `GET /organizations/{id}` - Institution details and metrics
- `GET /organizations/{id}/works` - Institutional publications

### Academic Venues
Journals, conferences, and publication venues
- `GET /venues` - Venue listings
- `GET /venues/{id}` - Venue details with impact metrics
- `GET /venues/search` - Venue search functionality
- `GET /venues/statistics` - Venue analytics and rankings
- `GET /venues/{id}/works` - Venue publication history

### Courses & Teaching
Academic courses and instructor profiles
- `GET /courses` - Course listings
- `GET /courses/{id}` - Comprehensive course analysis
- `GET /courses/{id}/bibliography` - Course reading lists
- `GET /courses/{id}/instructors` - Course instructors
- `GET /courses/{id}/subjects` - Subject categorization
- `GET /instructors` - Instructor directory
- `GET /instructors/{id}` - Instructor profiles
- `GET /instructors/{id}/statistics` - Comprehensive academic profiles
- `GET /instructors/{id}/courses` - Teaching history
- `GET /instructors/{id}/subjects` - Teaching specializations

### Bibliography Analysis
Academic bibliography and reading analysis
- `GET /bibliography` - Bibliography analysis tools
- `GET /bibliography/analysis` - Advanced bibliographic analysis
- `GET /bibliography/statistics` - Reading pattern analytics
- `GET /subjects` - Subject taxonomy (disciplinary vocabularies) [disabled in current distribution]
- `GET /subjects/{id}` - Subject details and associations [disabled in current distribution]
- `GET /signatures` - Author signature management [disabled in current distribution]

### Metrics & Analytics (11 endpoints)
Research metrics and institutional analytics
- `GET /metrics/dashboard` - System overview metrics
- `GET /metrics/venues` - Venue performance analytics
- `GET /metrics/sphinx` - Search engine performance
- `GET /metrics/sphinx/detailed` - Detailed Sphinx analytics
- `GET /metrics/annual` - Annual publication statistics
- `GET /metrics/collaborations` - Collaboration network metrics
- `GET /metrics/institutions` - Institutional productivity
- `GET /metrics/persons` - Researcher productivity analytics
- `GET /dashboard/overview` - Executive dashboard
- `GET /dashboard/performance` - System performance charts
- `GET /dashboard/search-trends` - Search analytics

## Specialized Management Systems

### Venue Management
- 1,563 registered venues (journals, conferences, repositories, book series)
- Multi-field search: name, ISSN, eISSN
- Type-based filtering and sorting
- Aggregated statistics and analytics
- Intelligent caching with configurable TTL
- Reliability: venue details endpoint hardened to avoid false 404 when optional tables are missing; falls back to minimal `venues` schema without joins.

### Signature Management
- 378,134 name signatures with person linkage
- Advanced search with exact matching support
- Statistics: avg 10.17 chars, 385k total signatures
- Person-to-signature relationship mapping
- Optimized queries with Redis caching

## System Features

### Rate Limiting & Access Control
- Limites configuráveis por ambiente (padrões recomendados):
  - Geral (`RATE_LIMIT_GENERAL`): 600 req/min por IP
  - Busca (`RATE_LIMIT_SEARCH`): 120 req/min por IP
  - Métricas (`RATE_LIMIT_METRICS`): 300 req/min por IP (localhost bypass)
  - Relacionais (`RATE_LIMIT_RELATIONAL`): 240 req/min por IP
  - Janela (`RATE_LIMIT_WINDOW_MS`): 60000 ms
- Speed limiting: atraso progressivo via `express-slow-down` configurado por `SLOW_DOWN_AFTER`, `SLOW_DOWN_DELAY`, `SLOW_DOWN_MAX`.
- Cabeçalhos padrão `RateLimit-*` são enviados nas respostas.
- IP blocking não é aplicado; excedentes recebem 429.
- Endpoints internos exigem `X-Access-Key` compatível com `API_KEY`.

## Repository Hygiene
- Do not commit generated artifacts, logs, backups or dumps.
- Ignored by default: `logs/`, `coverage/`, `venv/`, `backup/`, `database/*.sql`, `node_modules/`.
- Keep only current technical docs and OpenAPI under `docs/`.
- No commented-out code should be kept; remove obsolete sections. Keep only essential comments and up-to-date Swagger annotations.

#### Variáveis de ambiente relevantes (arquivo `/etc/node-backend.env`)
- Autenticação: `API_KEY` (prioritária), `INTERNAL_ACCESS_KEY`, `SECURITY_ACCESS_KEY`.
- Rate limiting: `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_GENERAL`, `RATE_LIMIT_SEARCH`, `RATE_LIMIT_METRICS`, `RATE_LIMIT_RELATIONAL`.
- Speed limiting: `SLOW_DOWN_AFTER`, `SLOW_DOWN_DELAY`, `SLOW_DOWN_MAX`.

### Caching Strategy
- **Search results**: 30 minutes TTL with Redis
- **Statistics**: Intelligent caching based on data volatility
- **Work details**: Optimized caching for frequent access
- **Performance**: Graceful degradation on cache failure

### Response Format
- **Standard JSON**: Consistent structure across endpoints
- **Pagination**: `{page, limit, total, totalPages, hasNext, hasPrev}`
- **Error handling**: Professional error responses
- **Content negotiation**: JSON with proper headers

## Migration Guide v1.x to v2.0

### Breaking Changes Summary

#### Response Envelope Structure
**v1.x**: Direct data array response
```json
[{"id": 1, "name": "Example"}]
```

**v2.0**: Standardized envelope with metadata
```json
{
  "status": "success",
  "data": [{"id": 1, "name": "Example"}],
  "pagination": {"page": 1, "limit": 10, "total": 100},
  "meta": {"engine": "MariaDB", "query_time_ms": 5}
}
```

#### Critical Field Changes
- `full_name` → `preferred_name` (persons endpoints)
- `work_type` → `type` (works endpoints)  
- `temp_doi` → `doi` (works, now via publications table)
- `publisher_name` → `publisher.name` (venues)
- `publisher_id` → `publisher.id` (venues)

#### Error Response Format
**v1.x**: Simple error string
```json
{"error": "Not found"}
```

**v2.0**: Structured error with metadata
```json
{
  "status": "error",
  "message": "Resource not found",
  "code": "NOT_FOUND",
  "timestamp": "2025-10-13T16:00:00Z"
}
```

#### Deprecated in v2.0 (Removal in v3.0)
- `legacy_metrics` parameter in venues
- `include_legacy` parameter 
- Direct database field exposure in some endpoints

### New v2.0 Features
- Citation analysis endpoints (`/works/{id}/citations`, `/works/{id}/references`)
- High-performance Sphinx search (`/search/sphinx`)
- Academic courses system (`/courses`, `/instructors`)
- Real-time analytics dashboard (`/metrics/dashboard`)
- Enhanced security with access keys for protected endpoints

## PAGINATION STANDARDIZATION - MANDATORY REQUIREMENTS

### Universal Compatibility - REQUIRED
All API endpoints MUST support BOTH pagination formats simultaneously:

- **Page-based**: `?page=2&limit=5` (modern format)
- **Offset-based**: `?offset=5&limit=5` (legacy compatibility)

### Automatic Conversion Examples
```bash
# These requests return identical results:
GET /works?page=3&limit=5        # Returns page 3
GET /works?offset=10&limit=5      # Automatically converts to page 3

# Search endpoints - both formats supported:
GET /search/works?q=machine&page=2&limit=5
GET /search/works?q=machine&offset=5&limit=5   # Auto-converts to page 2
```

### Standard Response Format - MANDATORY
All paginated responses MUST include this exact structure:
```json
{
  "status": "success",
  "data": [...],
  "pagination": {
    "page": 2,
    "limit": 5,
    "total": 650000,
    "totalPages": 130000,
    "hasNext": true,
    "hasPrev": true
  }
}
```

### Implementation Requirements - CRITICAL
- **Controllers**: MUST pass `page`, `limit`, AND `offset` to services
- **Services**: MUST use `normalizePagination()` for parameter processing
- **Responses**: MUST use `createPagination()` for consistent output
- **Testing**: MUST validate both `page/limit` and `offset/limit` formats

### Conversion Rules
- `offset=0&limit=5` → `page=1`
- `offset=5&limit=5` → `page=2`  
- `offset=10&limit=5` → `page=3`
- Formula: `page = Math.floor(offset / limit) + 1`

**VIOLATION OF THESE STANDARDS IS NOT ACCEPTABLE**

Endpoints validated: `/works`, `/search/works`, `/persons`, `/venues`, `/organizations`, and all sub-endpoints maintain full compatibility.

## Testing

```bash
npm test                              # Execute complete test suite
npm test -- tests/venues.test.js     # Execute venue-specific tests
npm run test:coverage                 # Generate coverage reports
npm run test:watch                    # Execute tests in watch mode
```

### Test Coverage
- Overall coverage: 85%+
- Venue system: 25/28 tests passing
- Core APIs: 100% functional
- Performance benchmarks: <200ms typical response times

## Monitoring and Observability

### Structured Logging
- `logs/error-YYYY-MM-DD.log` - Error tracking with stack traces
- `logs/combined-YYYY-MM-DD.log` - General application logs
- `logs/performance-YYYY-MM-DD.log` - Performance metrics and timing

### Real-time Metrics
- **Performance Monitoring**: Request timing, P95 response times, slow query detection
- **Error Tracking**: Classification, historical data, error rate monitoring
- **System Health**: Memory usage, CPU utilization, load averages
- **Cache Performance**: Redis tracking with TTL management
- **Endpoint Analytics**: Usage patterns and performance per endpoint

### Alert Thresholds
- Slow requests: >1000ms automatic detection
- Memory monitoring: Real-time usage tracking
- Error rate monitoring: <1% target threshold
- System uptime: Continuous availability monitoring

## Security Implementation

**Comprehensive Security Audit Completed**:
- **Vulnerability Assessment**: All critical and high-severity vulnerabilities resolved
- **Credential Security**: Environment variable enforcement, no hardcoded credentials
- **SSL/TLS Security**: Certificate validation enabled, private keys secured
- **Infrastructure Protection**: Comprehensive gitignore patterns, backup security

**Security Features**:
- Helmet.js security headers with CSP configuration
- Endpoint-specific rate limiting (defaults: 600 general, 120 search, 300 metrics, 240 relational per minute)
- Express-validator input validation and sanitization
- Secure error handling without information leakage
- Configurable CORS policies
- Database connection security with temporary configuration files

## Performance Metrics

### System Performance
- **57 functional endpoints** with comprehensive API coverage
- **Pagination standardization**: 100% compatibility with both `page/limit` and `offset/limit` formats
- **Search performance**: Sphinx ~18–26ms query execution; automatic MariaDB fallback
- **Response times**: <100ms typical; Sphinx endpoints often <30ms
- **Data coverage**: 2.62M+ works, 1.45M+ persons, 287k+ organizations indexed
- **Error rate**: <1% with professional error handling
- **Uptime**: Production-ready infrastructure with monitoring
- **Test coverage**: 85%+ across all major systems
- **Pagination compliance**: Universal format support validated across all endpoints

### Infrastructure Status
- **7 Sphinx indexes**: Operational with real-time updates
  - Feature flag: set `VENUES_SPHINX_ENABLED=false` to temporarily force MariaDB on `GET /venues` while keeping Sphinx enabled elsewhere.
- **Security audit**: All critical vulnerabilities resolved
- **Code standards**: Professional codebase with minimal commenting
- **Monitoring**: Structured logging with performance analytics
- **Caching**: Redis integration with intelligent TTL management

### Quick Start Commands
```bash
./server.sh start                     # Start API server with Sphinx integration
./server.sh status                    # Check system health and metrics
curl localhost:3000/                  # API overview and endpoint catalog
curl localhost:3000/health            # Comprehensive system monitoring
curl localhost:3000/docs              # Interactive API documentation
curl localhost:3000/search/sphinx?q=machine+learning # Test search performance
```

## Quick Examples

### Search Operations
```bash
# Primary search with automatic fallback
GET /search/works?q=machine+learning&limit=10

# Direct high-performance Sphinx search  
GET /search/sphinx?q=artificial+intelligence&limit=5

# Advanced faceted search with filters
GET /search/advanced?q=covid&year_from=2020&peer_reviewed=true

# Intelligent autocomplete suggestions
GET /search/autocomplete?q=data+sci
```

### Data Retrieval
```bash
# Get work details with complete author information
GET /works/123456

# Researcher profile with collaboration networks
GET /persons/5952

# Institution details with publication metrics
GET /organizations/12345

# Venue analytics with impact metrics
GET /venues/1/statistics
```

### Analytics & Metrics
```bash
# System overview dashboard
GET /metrics/dashboard

# Research collaboration networks
GET /persons/5952/collaborators

# Citation network analysis
GET /works/123456/citations

# Comprehensive instructor profiles
GET /instructors/31/statistics
```

## Technical Architecture

### Multi-Layer Architecture
```
┌─────────────────────────────────────────┐
│           API Layer (Express.js)        │
├─────────────────────────────────────────┤
│         Business Logic (Services)       │
├─────────────────────────────────────────┤
│    Search Engine Layer (Sphinx 2.2.11)  │
├─────────────────────────────────────────┤
│      Cache Layer (Redis v7.0.15)        │
├─────────────────────────────────────────┤
│     Database Layer (MariaDB + Views)    │
└─────────────────────────────────────────┘
```

### Search Engine Performance
- **Sphinx Indexes**: 7 operational with real-time updates
- **Query Performance**: 2-4ms execution vs 450ms traditional
- **Fallback Strategy**: Automatic MariaDB fallback with error logging
- **Index Management**: Automated rebuilding and optimization

### Security Implementation
- **Vulnerability Audit**: All critical and high-severity issues resolved
- **Credential Management**: Environment variables only, no hardcoded secrets
- **SSL/TLS Security**: Certificate validation enabled
- **Infrastructure Protection**: Comprehensive gitignore patterns

### Monitoring & Observability
- **Structured Logging**: Winston with daily rotation
- **Performance Metrics**: Real-time response time tracking
- **Error Classification**: Professional error handling and tracking
- **System Health**: Memory, CPU, and service monitoring

## Support & Documentation

### Documentation Resources
- **Interactive API Docs**: [http://localhost:3000/docs](http://localhost:3000/docs)
- **OpenAPI Specification**: [http://localhost:3000/docs.json](http://localhost:3000/docs.json)
- **System Health**: [http://localhost:3000/health](http://localhost:3000/health)
- **Performance Status**: [http://localhost:3000/search/sphinx/status](http://localhost:3000/search/sphinx/status)

## Public API Access - Production

### Live API Endpoints (api.ethnos.app)

**Documentation and System**
- **https://api.ethnos.app/** - Main API overview
- **https://api.ethnos.app/docs** - Interactive Swagger UI documentation  
- **https://api.ethnos.app/docs.json** - OpenAPI 3.0 specification
- **https://api.ethnos.app/health** - System status and monitoring

**Primary Endpoints**

*Search and Discovery*
- **https://api.ethnos.app/search/works** - Primary works search
- **https://api.ethnos.app/search/sphinx** - High-performance Sphinx search
- **https://api.ethnos.app/search/advanced** - Advanced search with filters
- **https://api.ethnos.app/search/autocomplete** - Intelligent suggestions

*Academic Data*
- **https://api.ethnos.app/works** - Academic works
- **https://api.ethnos.app/persons** - Researchers
- **https://api.ethnos.app/organizations** - Institutions
- **https://api.ethnos.app/venues** - Academic venues
- **https://api.ethnos.app/courses** - Academic courses

*Metrics and Analytics*
- **https://api.ethnos.app/metrics/dashboard** - System dashboard
- **https://api.ethnos.app/metrics/venues** - Venue analytics
- **https://api.ethnos.app/metrics/sphinx** - Search engine performance

**Total**: 57 functional public endpoints available at api.ethnos.app

### Technical Contact
- **Developer**: Bruno Cesar Cunha Cruz, PhD Student
- **Institution**: PPGAS/MN/UFRJ (Graduate Program in Social Anthropology, National Museum, Federal University of Rio de Janeiro)
- **Project**: Academic Bibliography System
- **Website**: [https://ethnos.app](https://ethnos.app)

### License
MIT License - Free for academic and commercial use

---

**Ethnos.app Academic Bibliography API v2.0.0** - Production-ready system serving the global research community with high-performance bibliographic data access and analysis capabilities.
