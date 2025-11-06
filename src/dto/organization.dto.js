function toOptionalInteger(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return Math.trunc(parsed);
}

function normalizeType(value) {
  if (!value) {
    return null;
  }
  const str = String(value).trim();
  return str ? str.toUpperCase() : null;
}

function normalizeString(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
}

function normalizeLocation(row = {}) {
  const source = row.location && typeof row.location === 'object'
    ? row.location
    : row;

  const country = normalizeString(source.country_code || source.country);
  const city = normalizeString(source.city);

  if (!country && !city) {
    return null;
  }

  return {
    country_code: country,
    city
  };
}

function normalizeIdentifiers(row = {}) {
  const identifiers = row.identifiers && typeof row.identifiers === 'object'
    ? row.identifiers
    : row;

  return {
    ror_id: normalizeString(identifiers.ror_id || identifiers.ror || identifiers.rorId) || null,
    grid_id: normalizeString(identifiers.grid_id || identifiers.gridId) || null,
    wikidata_id: normalizeString(identifiers.wikidata_id || identifiers.wikidataId) || null,
    openalex_id: normalizeString(identifiers.openalex_id) || null,
    mag_id: normalizeString(identifiers.mag_id) || null,
    url: normalizeString(identifiers.url) || null
  };
}

function formatMetrics(raw = {}) {
  const metrics = raw.metrics && typeof raw.metrics === 'object'
    ? raw.metrics
    : raw;

  const worksCount = toOptionalInteger(metrics.works_count ?? metrics.publication_count);
  const affiliatedAuthors = toOptionalInteger(
    metrics.affiliated_authors_count ?? metrics.unique_researchers ?? metrics.researcher_count
  );

  return {
    works_count: worksCount === null ? 0 : worksCount,
    affiliated_authors_count: affiliatedAuthors === null ? 0 : affiliatedAuthors,
    total_citations: toOptionalInteger(metrics.total_citations),
    open_access_works_count: toOptionalInteger(metrics.open_access_works_count),
    first_publication_year: toOptionalInteger(metrics.first_publication_year),
    latest_publication_year: toOptionalInteger(metrics.latest_publication_year)
  };
}

function formatOrganizationListItem(row = {}) {
  return {
    id: toOptionalInteger(row.id),
    name: normalizeString(row.name),
    type: normalizeType(row.type),
    location: normalizeLocation(row),
    // Explicit fields from table
    ror_id: normalizeString(row.ror_id),
    wikidata_id: normalizeString(row.wikidata_id),
    openalex_id: normalizeString(row.openalex_id),
    mag_id: normalizeString(row.mag_id),
    url: normalizeString(row.url),
    identifiers: normalizeIdentifiers(row),
    metrics: formatMetrics(row),
    created_at: row.created_at || null,
    updated_at: row.updated_at || null
  };
}

function formatTopAuthors(items = []) {
  if (!Array.isArray(items)) {
    return [];
  }
  return items.map(item => ({
    person_id: toOptionalInteger(item.person_id || item.id),
    preferred_name: normalizeString(item.preferred_name || item.name),
    works_count: toOptionalInteger(item.works_count) || 0,
    latest_publication_year: toOptionalInteger(item.latest_publication_year),
    recent_works_count: toOptionalInteger(item.recent_works_count)
  }));
}

function formatProductionSummary(raw = {}) {
  const summary = {
    by_work_type: [],
    publication_trend: []
  };

  if (Array.isArray(raw.by_work_type)) {
    summary.by_work_type = raw.by_work_type.map(item => ({
      type: normalizeType(item.type),
      works_count: toOptionalInteger(item.works_count) || 0
    }));
  }

  if (Array.isArray(raw.publication_trend)) {
    summary.publication_trend = raw.publication_trend.map(item => ({
      year: toOptionalInteger(item.year),
      works_count: toOptionalInteger(item.works_count) || 0
    }));
  }

  return summary;
}

function parseAuthors(authorString) {
  if (!authorString || typeof authorString !== 'string') {
    return [];
  }
  return authorString
    .split(';')
    .map(author => author.trim())
    .filter(Boolean);
}

function formatRecentWorks(items = []) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.map(work => {
    const authors = parseAuthors(work.author_string);
    return {
      id: toOptionalInteger(work.id),
      title: normalizeString(work.title),
      type: normalizeType(work.type || work.work_type),
      language: normalizeString(work.language),
      publication: {
        year: toOptionalInteger(work.year),
        doi: normalizeString(work.doi),
        volume: normalizeString(work.volume),
        issue: normalizeString(work.issue),
        pages: normalizeString(work.pages),
        peer_reviewed: work.peer_reviewed === true || work.peer_reviewed === 1,
        open_access: work.open_access === true || work.open_access === 1
      },
      venue: work.venue_name || work.venue_type
        ? {
            id: toOptionalInteger(work.venue_id),
            name: normalizeString(work.venue_name),
            type: normalizeType(work.venue_type)
          }
        : null,
      authors: {
        author_count: toOptionalInteger(work.author_count) ?? authors.length,
        first_author_name: normalizeString(work.first_author_name || authors[0]),
        authors_preview: authors.slice(0, 3)
      }
    };
  });
}

function formatOrganizationDetails(org = {}) {
  const location = normalizeLocation(org);
  const identifiers = normalizeIdentifiers(org);
  const metrics = formatMetrics(org.metrics ? org : { ...org, metrics: org.metrics });
  const productionSummary = formatProductionSummary(org.production_summary || {});
  const topAuthors = formatTopAuthors(org.top_authors);
  const recentWorks = formatRecentWorks(org.recent_works);

  return {
    id: toOptionalInteger(org.id),
    name: normalizeString(org.name),
    type: normalizeType(org.type),
    location,
    ror_id: normalizeString(org.ror_id) || identifiers.ror_id || null,
    wikidata_id: normalizeString(org.wikidata_id) || identifiers.wikidata_id || null,
    openalex_id: normalizeString(org.openalex_id) || identifiers.openalex_id || null,
    mag_id: normalizeString(org.mag_id) || identifiers.mag_id || null,
    url: normalizeString(org.url) || identifiers.url || null,
    identifiers,
    metrics,
    production_summary: productionSummary,
    top_authors: topAuthors,
    recent_works: recentWorks,
    created_at: org.created_at || null,
    updated_at: org.updated_at || null
  };
}

module.exports = { formatOrganizationListItem, formatOrganizationDetails };
