

process.env.NODE_ENV = 'test';
process.env.JEST_FAST = '1';
process.env.INTERNAL_ACCESS_KEY = process.env.INTERNAL_ACCESS_KEY || 'test-internal-key';
process.env.SECURITY_ACCESS_KEY = process.env.SECURITY_ACCESS_KEY || 'test-security-key';

jest.mock('../src/config/database', () => {
  const QueryTypes = { SELECT: 'SELECT' };
  const define = jest.fn(() => ({
    belongsTo: jest.fn(),
    belongsToMany: jest.fn(),
    hasMany: jest.fn(),
  }));
  return {
    sequelize: {
      query: jest.fn().mockResolvedValue([{ exists_check: 1 }]),
      QueryTypes,
      close: jest.fn().mockResolvedValue(true),
      define,
    },
    testConnection: jest.fn().mockResolvedValue(true),
    closePool: jest.fn().mockResolvedValue(true),
    pool: {},
    config: {},
  };
});

jest.mock('../src/config/redis', () => ({
  testRedisConnection: jest.fn().mockResolvedValue(true),
  quit: jest.fn().mockResolvedValue(),
  connected: false,
}));

const { createMockReq, createMockRes, withResponseFormatter } = require('./helpers/mock-express');
const { invokeRouter } = require('./helpers/router-invoke');

const healthRouter = require('../src/routes/health');
const worksRouter = require('../src/routes/works');
const personsRouter = require('../src/routes/persons');
const orgsRouter = require('../src/routes/organizations');
const venuesRouter = require('../src/routes/venues');
const searchRouter = require('../src/routes/search');
const citationsRouter = require('../src/routes/citations');
const collaborationsRouter = require('../src/routes/collaborations');
const coursesRouter = require('../src/routes/courses');
const instructorsRouter = require('../src/routes/instructors');
const bibliographyRouter = require('../src/routes/bibliography');
const securityRouter = require('../src/routes/security');

const dbConfig = require('../src/config/database');
const redisConfig = require('../src/config/redis');
const worksService = require('../src/services/works.service');
const personsService = require('../src/services/persons.service');
const orgsService = require('../src/services/organizations.service');
const venuesService = require('../src/services/venues.service');
const searchService = require('../src/services/search.service');
const citationsService = require('../src/services/citations.service');
const collaborationsService = require('../src/services/collaborations.service');
const coursesService = require('../src/services/courses.service');
const instructorsService = require('../src/services/instructors.service');
const bibliographyService = require('../src/services/bibliography.service');

const pageMeta = (page = 1, limit = 10, total = 2) => ({
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit)),
  hasNext: page * limit < total,
  hasPrev: page > 1,
});

beforeAll(() => {
  dbConfig.testConnection.mockResolvedValue(true);
  redisConfig.testRedisConnection.mockResolvedValue(true);
});

afterAll(() => {
  jest.restoreAllMocks();
});

describe('Health', () => {
  test('GET /health/live returns alive', async () => {
    const req = createMockReq({ method: 'GET', path: '/health/live' });
    const res = withResponseFormatter(req, createMockRes());
    await invokeRouter({ router: healthRouter, method: 'get', path: '/live', req, res });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data).toHaveProperty('alive', true);
  });

});

describe('Works', () => {
  test('GET /works returns paginated list', async () => {
    jest.spyOn(worksService, 'getWorks').mockResolvedValue({
      data: [
        { id: 1, title: 'Sample Work', type: 'ARTICLE', authors_preview: [], venue: { name: 'Test' }, publication_year: 2020, data_source: 'TEST' },
        { id: 2, title: 'Another Work', type: 'BOOK', authors_preview: [], venue: { name: 'Test' }, publication_year: 2019, data_source: 'TEST' },
      ],
      pagination: pageMeta(1, 10, 2),
      performance: { engine: 'mock', query_type: 'list', elapsed_ms: 1 },
    });

    const req = createMockReq({ method: 'GET', path: '/works', query: { limit: 10 } });
    const res = withResponseFormatter(req, createMockRes());
    await invokeRouter({ router: worksRouter, method: 'get', path: '/', req, res });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('success');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body).toHaveProperty('pagination');
  });

  test('GET /works/:id returns work object', async () => {
    jest.spyOn(worksService, 'getWorkById').mockResolvedValue({ id: 123, title: 'Work 123' });
    const req = createMockReq({ method: 'GET', path: '/works/123', params: { id: '123' } });
    const res = withResponseFormatter(req, createMockRes());
    await invokeRouter({ router: worksRouter, method: 'get', path: '/:id', req, res });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data).toHaveProperty('id', 123);
  });
});

describe('Persons', () => {
  test('GET /persons returns paginated list', async () => {
    jest.spyOn(personsService, 'getPersons').mockResolvedValue({
      data: [{ id: 1, preferred_name: 'Test', metrics: { works_count: 0 } }],
      pagination: pageMeta(1, 10, 1),
      performance: { engine: 'mock', elapsed_ms: 1 },
    });
    const req = createMockReq({ method: 'GET', path: '/persons', query: { limit: 10 } });
    const res = withResponseFormatter(req, createMockRes());
    await invokeRouter({ router: personsRouter, method: 'get', path: '/', req, res });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('GET /persons/:id returns person', async () => {
    jest.spyOn(personsService, 'getPersonById').mockResolvedValue({ id: 7, preferred_name: 'Jane Doe' });
    const req = createMockReq({ method: 'GET', path: '/persons/7', params: { id: '7' } });
    const res = withResponseFormatter(req, createMockRes());
    await invokeRouter({ router: personsRouter, method: 'get', path: '/:id', req, res });
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveProperty('id', 7);
  });
});

describe('Organizations', () => {
  test('GET /organizations returns list', async () => {
    jest.spyOn(orgsService, 'getOrganizations').mockResolvedValue({
      data: [{ id: 1, name: 'Test University', identifiers: { ror_id: 'RORX' }, metrics: { works_count: 0 } }],
      pagination: pageMeta(1, 20, 1),
      performance: { engine: 'mock' },
      meta: { engine: 'mock' },
    });
    const req = createMockReq({ method: 'GET', path: '/organizations', query: {} });
    const res = withResponseFormatter(req, createMockRes());
    await invokeRouter({ router: orgsRouter, method: 'get', path: '/', req, res });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('GET /organizations/:id returns details', async () => {
    jest.spyOn(orgsService, 'getOrganizationById').mockResolvedValue({ id: 1, name: 'Test University', metrics: { works_count: 10 } });
    const req = createMockReq({ method: 'GET', path: '/organizations/1', params: { id: '1' } });
    const res = withResponseFormatter(req, createMockRes());
    await invokeRouter({ router: orgsRouter, method: 'get', path: '/:id', req, res });
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveProperty('id', 1);
  });
});

describe('Venues', () => {
  test('GET /venues returns list', async () => {
    jest.spyOn(venuesService, 'getVenues').mockResolvedValue({
      data: [{ id: 1, name: 'Journal of Tests', type: 'JOURNAL', works_count: 0 }],
      pagination: { total: 1, limit: 20, offset: 0, pages: 1 },
      meta: { engine: 'mock' },
    });
    const req = createMockReq({ method: 'GET', path: '/venues', query: {} });
    const res = withResponseFormatter(req, createMockRes());
    await invokeRouter({ router: venuesRouter, method: 'get', path: '/', req, res });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('Search', () => {
  test('GET /search/works returns results', async () => {
    jest.spyOn(searchService, 'searchWorks').mockResolvedValue({
      data: [{ id: 101, title: 'Anthropology 101', type: 'ARTICLE', authors_preview: [], venue: { name: 'X' } }],
      pagination: pageMeta(1, 10, 1),
      meta: { performance: { engine: 'mock' }, query: 'anthropology' },
      performance: { engine: 'mock', query_type: 'search' },
    });
    const req = createMockReq({ method: 'GET', path: '/search/works', query: { q: 'anthropology' } });
    const res = withResponseFormatter(req, createMockRes());
    await invokeRouter({ router: searchRouter, method: 'get', path: '/works', req, res });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('Citations', () => {
  test('GET /works/:id/citations returns list', async () => {
    jest.spyOn(citationsService, 'getWorkCitations').mockResolvedValue({
      work_id: 5,
      citing_works: [{ id: 1, citing_work_id: 2 }],
      pagination: pageMeta(1, 10, 1),
      filters: { type: 'all' },
    });
    const req = createMockReq({ method: 'GET', path: '/works/5/citations', params: { id: '5' }, query: { page: 1, limit: 10 } });
    const res = withResponseFormatter(req, createMockRes());
    await invokeRouter({ router: citationsRouter, method: 'get', path: '/works/:id/citations', req, res });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.data.citing_works)).toBe(true);
  });
});

describe('Collaborations', () => {
  test('GET /persons/:id/collaborators returns list', async () => {
    jest.spyOn(collaborationsService, 'getPersonCollaborators').mockResolvedValue({
      person_id: 1,
      total_collaborators: 1,
      collaborators: [{ collaborator_id: 2, collaborator_name: 'X' }],
      pagination: pageMeta(1, 10, 1),
    });
    const req = createMockReq({ method: 'GET', path: '/persons/1/collaborators', params: { id: '1' }, query: { page: 1, limit: 10 } });
    const res = withResponseFormatter(req, createMockRes());
    await invokeRouter({ router: collaborationsRouter, method: 'get', path: '/persons/:id/collaborators', req, res });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.data.collaborators)).toBe(true);
  });
});

describe('Courses & Instructors', () => {
  test('GET /courses returns list', async () => {
    jest.spyOn(coursesService, 'getCourses').mockResolvedValue({
      data: [{ id: 1, name: 'Anthropology Intro' }],
      pagination: pageMeta(1, 10, 1),
      meta: {},
    });
    const req = createMockReq({ method: 'GET', path: '/courses', query: {} });
    const res = withResponseFormatter(req, createMockRes());
    await invokeRouter({ router: coursesRouter, method: 'get', path: '/', req, res });
    expect(res.statusCode).toBe(200);
  });

  test('GET /instructors returns list', async () => {
    jest.spyOn(instructorsService, 'getInstructors').mockResolvedValue({
      data: [{ id: 10, preferred_name: 'Prof. Test' }],
      pagination: pageMeta(1, 10, 1),
      meta: {},
    });
    const req = createMockReq({ method: 'GET', path: '/instructors', query: {} });
    const res = withResponseFormatter(req, createMockRes());
    await invokeRouter({ router: instructorsRouter, method: 'get', path: '/', req, res });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('DTOs structure', () => {
  test('Venue DTO includes explicit IDs', () => {
    const { formatVenueListItem } = require('../src/dto/venue.dto');
    const input = {
      id: 1,
      name: 'Test Venue',
      type: 'JOURNAL',
      scopus_id: '12345',
      wikidata_id: 'Q123',
      openalex_id: 'V123',
      mag_id: 'M123',
      issn: '1111-2222',
      eissn: '3333-4444'
    };
    const out = formatVenueListItem(input);
    expect(out).toHaveProperty('scopus_id', '12345');
    expect(out).toHaveProperty('wikidata_id', 'Q123');
    expect(out).toHaveProperty('openalex_id', 'V123');
    expect(out).toHaveProperty('mag_id', 'M123');
  });

  test('Person DTO includes explicit IDs and name_variations', () => {
    const { formatPersonDetails, formatPersonListItem } = require('../src/dto/person.dto');
    const person = {
      id: 10,
      preferred_name: 'Jane Doe',
      given_names: 'Jane',
      family_name: 'Doe',
      orcid: '0000-0001-2345-6789',
      scopus_id: 'SC123',
      lattes_id: 'L123',
      wikidata_id: 'Q987',
      openalex_id: 'A-1',
      mag_id: 'MAG-1',
      url: 'https://example.org/jane',
      name_variations: 'J. Doe;Jane D.'
    };
    const details = formatPersonDetails(person);
    expect(details).toMatchObject({
      orcid: '0000-0001-2345-6789',
      scopus_id: 'SC123',
      lattes_id: 'L123',
      wikidata_id: 'Q987',
      openalex_id: 'A-1',
      mag_id: 'MAG-1',
      url: 'https://example.org/jane'
    });
    expect(Array.isArray(details.name_variations)).toBe(true);
    expect(details.name_variations.length).toBeGreaterThan(0);

    const listItem = formatPersonListItem(person);
    expect(listItem).toHaveProperty('scopus_id', 'SC123');
  });

  test('Organization DTO exposes explicit IDs and keeps identifiers object', () => {
    const { formatOrganizationDetails, formatOrganizationListItem } = require('../src/dto/organization.dto');
    const org = {
      id: 2,
      name: 'Test University',
      type: 'university',
      ror_id: 'ROR123',
      wikidata_id: 'Q555',
      openalex_id: 'O-9',
      mag_id: 'MAG-O',
      url: 'https://example.org/u'
    };
    const details = formatOrganizationDetails(org);
    expect(details).toMatchObject({
      ror_id: 'ROR123',
      wikidata_id: 'Q555',
      openalex_id: 'O-9',
      mag_id: 'MAG-O',
      url: 'https://example.org/u'
    });
    expect(details).toHaveProperty('identifiers');
    const listItem = formatOrganizationListItem(org);
    expect(listItem).toHaveProperty('ror_id', 'ROR123');
  });

  test('Work DTO includes new identifier fields explicitly', () => {
    const { formatWorkDetails, formatWorkListItem } = require('../src/dto/work.dto');
    const work = {
      id: 3,
      title: 'Test Work',
      pmid: '123456',
      pmcid: 'PMC999',
      arxiv: 'arXiv:2101.00001',
      wos_id: 'WOS:ABC',
      handle: '12345/6789',
      url: 'https://example.org/w',
      wikidata_id: 'Q42',
      openalex_id: 'W-1',
      mag_id: 'MAG-W'
    };
    const details = formatWorkDetails(work);
    expect(details).toMatchObject({
      pmid: '123456',
      pmcid: 'PMC999',
      arxiv: 'arXiv:2101.00001',
      wos_id: 'WOS:ABC',
      handle: '12345/6789',
      url: 'https://example.org/w',
      wikidata_id: 'Q42',
      openalex_id: 'W-1',
      mag_id: 'MAG-W'
    });
    const listItem = formatWorkListItem(work);
    expect(listItem).toHaveProperty('pmid', '123456');
    expect(listItem).toHaveProperty('openalex_id', 'W-1');
  });

  test('Work DTO exposes openacess identifier for files', () => {
    const { formatWorkDetails } = require('../src/dto/work.dto');
    const work = {
      id: 99,
      files: [
        {
          file_id: 1,
          openacess_id: 'OA-999'
        }
      ]
    };
    const details = formatWorkDetails(work);
    expect(details.files).toHaveLength(1);
    expect(details.files[0]).toHaveProperty('openacess_id', 'OA-999');
  });
});

describe('Bibliography', () => {
  test('GET /bibliography returns list', async () => {
    jest.spyOn(bibliographyService, 'getBibliography').mockResolvedValue({
      data: [{ id: 1, work_id: 123, course_id: 5 }],
      pagination: pageMeta(1, 10, 1),
      meta: {},
    });
    const req = createMockReq({ method: 'GET', path: '/bibliography', query: {} });
    const res = withResponseFormatter(req, createMockRes());
    await invokeRouter({ router: bibliographyRouter, method: 'get', path: '/', req, res });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('Security', () => {
  test('GET /security/stats requires key and responds', async () => {
    const req = createMockReq({ method: 'GET', path: '/security/stats', headers: { 'x-access-key': process.env.SECURITY_ACCESS_KEY } });
    const res = withResponseFormatter(req, createMockRes());
    await invokeRouter({ router: securityRouter, method: 'get', path: '/stats', req, res });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data).toHaveProperty('stats');
  });
});
