**Ethnos.app Academic Bibliography API v2.0.0 - Release Documentation**

[![DOI](https://zenodo.org/badge/1049971688.svg)](https://doi.org/10.5281/zenodo.17049435)

**Release Date:** September 2025
**Status:** Production Ready
**License:** MIT - Academic Research Platform
**AI Declaration Date:** 2025-09-03

## Executive Summary

The Ethnos.app Academic Bibliography API v2.0.0 represents a comprehensive RESTful service providing high-performance bibliographic research capabilities across all academic disciplines. This production-ready release features 86 functional endpoints, serves over 1.16 million academic works, and delivers revolutionary search performance with 221x improvement over traditional methods through Sphinx integration. The system implements enterprise-grade security with all critical vulnerabilities resolved and maintains comprehensive monitoring and analytics.

## AI Utilization Transparency

### Development Methodology
This project employed a multi-model AI strategy with Anthropic Claude serving as primary development assistant for complex code implementation and algorithmic problem-solving. Google Gemini provided architectural research validation, while DeepSeek Chat and xAI Grok assisted with code generation and ideation respectively.

### Human Oversight Protocol
All AI-generated output underwent rigorous validation including critical analysis for correctness, manual security audits, comprehensive testing with 85%+ coverage, and performance benchmarking under production-like conditions. The human developer retains full accountability for architectural decisions, business logic, and final implementation.

## Technical Architecture

### Core Infrastructure
- **Backend Runtime:** Node.js + Express.js with layered service architecture
- **Database Layer:** MariaDB with optimized queries and analytical views
- **Search Engine:** Sphinx 2.2.11 with 7 operational indexes
- **Cache System:** Redis v7.0.15 with intelligent TTL management
- **Documentation:** OpenAPI 3.0 specification with Swagger UI
- **Security:** Comprehensive implementation with resolved vulnerabilities

### System Requirements
- Node.js >= 18.0.0
- MariaDB >= 10.5
- Redis >= 6.0 (optional for caching)
- Sphinx 2.2.11 (for high-performance search)
- 8GB+ RAM for optimal performance
- 2GB+ storage for indexes and logs

## Data Statistics

- **1,165,827** academic works indexed (1950-2025)
- **549,480** researcher profiles with ORCID/Lattes integration
- **182,176** institutional organizations with ROR ID linking
- **4,945** academic venues (journals, conferences, repositories)
- **433** academic courses with bibliography analysis
- **378,134** name signatures with advanced disambiguation

## API Capabilities

### Search & Discovery (15 endpoints)
- High-performance search with 2-4ms response times via Sphinx integration
- Advanced filtering by year, venue, author, institution, and subject classification
- Intelligent autocomplete with real-time suggestions
- Faceted search with multi-dimensional filtering

### Academic Data Management (40+ endpoints)
- Complete work metadata with citation network analysis
- Researcher profiles with publication history and collaboration networks
- Institutional analytics with productivity metrics and geographic distribution
- Venue management with impact factors and publication trends
- Course integration with bibliography analysis and reading list management

### Analytics & Metrics (11 endpoints)
- System dashboard with comprehensive performance metrics
- Research collaboration networks and citation analysis
- Institutional productivity analytics and venue performance tracking
- Real-time search engine performance monitoring

## Performance Specifications

### Revolutionary Search Performance
- **Sphinx Search Execution:** 2-4ms response times
- **Traditional Search Baseline:** 450ms MariaDB execution
- **Performance Improvement:** 221x faster search operations
- **Production Validation:** 7.8x real-world improvement demonstrated

### System Performance
- **Typical Response Times:** <100ms for standard queries
- **Cached Results:** <10ms response times
- **Complex Analytics:** <500ms for multi-dimensional analysis
- **Error Rate:** <1% with professional error handling
- **Concurrent Capacity:** Optimized for high-traffic academic research scenarios

## Security Implementation

### Comprehensive Security Audit
- **4 CRITICAL** vulnerabilities identified and resolved
- **3 HIGH** severity issues addressed and mitigated
- Professional hardening of all system components

### Security Features
- Helmet.js security headers with CSP configuration
- Tiered rate limiting (100/min general, 20/min search, 10/min downloads)
- Express-validator input validation and sanitization
- Secure error handling without information leakage
- Environment variable enforcement for all credentials

### Access Control
- Public API access without authentication requirements
- Intelligent IP-based throttling with academic domain exceptions
- Automatic abuse protection with violation detection
- Configurable CORS policies for cross-origin requests

## Installation & Deployment

### Production Deployment
```bash
git clone https://github.com/bzuer/ethnos_api
cd api
npm install

cp .env.example .env
# Configure environment variables in .env

./server.sh start
```

### Environment Configuration
```env
DB_HOST=localhost
DB_PORT=3306
DB_NAME=your_database_name
DB_USER=your_database_user
DB_PASSWORD=your_secure_password
NODE_ENV=production
DB_SSL=true
REDIS_HOST=localhost
REDIS_PORT=6379
PORT=3000
```

### Server Management
```bash
./server.sh start     # Start server with automatic cleanup
./server.sh restart   # Restart with complete process cleanup
./server.sh stop      # Stop server gracefully
./server.sh status    # Check server status and health
./server.sh cleanup   # Manual process and port cleanup
```

## API Documentation

### Interactive Resources
- **Base URL:** http://localhost:3000
- **Swagger UI:** http://localhost:3000/docs
- **OpenAPI Specification:** http://localhost:3000/docs.json
- **Health Check:** http://localhost:3000/health

### Live Production Endpoints
- **https://api.ethnos.app/** - API overview and documentation
- **https://api.ethnos.app/docs** - Interactive Swagger UI
- **https://api.ethnos.app/health** - System status monitoring

## Monitoring & Observability

### Structured Logging
- Daily log rotation with multiple log files
- Error tracking with comprehensive stack traces
- Performance metrics and timing analytics
- System health monitoring with real-time alerts

### Real-time Metrics
- Request timing and P95 response times
- Error classification and rate monitoring
- Memory usage and CPU utilization tracking
- Cache performance and TTL management analytics

### Alert Thresholds
- Slow request detection: >1000ms automatic logging
- Memory monitoring: Real-time usage tracking
- Error rate threshold: <1% target maintenance
- System uptime: Continuous availability monitoring

## Testing & Quality Assurance

### Test Coverage
- **Overall Coverage:** 85%+ across all major systems
- **Venue System:** 25/28 tests passing
- **Core APIs:** 100% functional validation
- **Performance:** <200ms typical response times verified

### Test Execution
```bash
npm test                      # Complete test suite execution
npm test -- tests/venues.test.js # Specific test file execution
npm run test:coverage         # Coverage report generation
npm run test:watch            # Watch mode testing
```

## Funding & Compliance

### Financial Disclosure
This API was developed without external funding, sponsorships, or grants. Development was supported by a CNPq doctoral scholarship (BRL 3,100/month), with all computational resources utilizing free and open-source software or academic licenses.

### Ethical Compliance
- No sensitive user data or PII shared with AI models
- Professional security standards implementation
- Complete development transparency maintained
- Academic integrity and research ethics adherence

## Technical Support

### Development Team
- **Lead Developer:** Bruno Cesar Cunha Cruz, PhD Student
- **Institution:** PPGAS/MN/UFRJ (Graduate Program in Social Anthropology, National Museum, Federal University of Rio de Janeiro)
- **Project:** Academic Bibliography System
- **Website:** https://ethnos.app

### Support Resources
- Complete API documentation with examples
- Technical consulting for complex integration scenarios
- Performance optimization guidance for high-volume usage
- Custom endpoint development for specific research requirements

## Citation

**APA Style:**
Cruz, B. C. C. (2025). Ethnos.app Academic Bibliography API (Version 2.0.0) [Software]. https://doi.org/10.5281/zenodo.17049435

**BibTeX:**
```bibtex
@software{ethnos_api_2025,
  author = {Cruz, Bruno Cesar Cunha},
  title = {Ethnos.app Academic Bibliography API},
  version = {2.0.0},
  year = {2025},
  doi = {10.5281/zenodo.17049435},
  url = {https://ethnos.app}
}
```

**Maintainer:** Bruno Cesar Cunha Cruz, PhD Student  
**ORCID:** [0000-0001-8652-2333](https://orcid.org/0000-0001-8652-2333)  
**Institution:** PPGAS/MN/UFRJ  
**Funding:** CNPq Doctoral Scholarship (Exclusive Dedication)  

**Contact:** Technical documentation and integration support available through https://ethnos.app  
**DOI:** https://doi.org/10.5281/zenodo.17049435  
**Status:** Enterprise-ready academic research infrastructure
