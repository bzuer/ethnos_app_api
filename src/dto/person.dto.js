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

function toOptionalBoolean(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (value === 0) return false;
    if (value === 1) return true;
    return value > 0;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return null;
    }
    if (['1', 'true', 'yes', 'y'].includes(normalized)) {
      return true;
    }
    if (['0', 'false', 'no', 'n'].includes(normalized)) {
      return false;
    }
  }
  return null;
}

function ensureArrayOfStrings(value) {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value
      .map(item => (item === null || item === undefined ? null : String(item).trim()))
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    if (!value.trim()) {
      return [];
    }
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed
          .map(item => (item === null || item === undefined ? null : String(item).trim()))
          .filter(Boolean);
      }
    } catch (e) {
      // fall-through to split handling
    }
    return value
      .split(/[;,]/)
      .map(item => item.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeIdentifiers(raw = {}) {
  const identifiers = {
    orcid: raw.orcid || raw.identifiers?.orcid || null,
    lattes_id: raw.lattes_id || raw.identifiers?.lattes_id || null,
    scopus_id: raw.scopus_id || raw.identifiers?.scopus_id || null,
    wikidata_id: raw.wikidata_id || raw.identifiers?.wikidata_id || null,
    openalex_id: raw.openalex_id || raw.identifiers?.openalex_id || null,
    mag_id: raw.mag_id || raw.identifiers?.mag_id || null,
    url: raw.url || raw.identifiers?.url || null
  };

  return Object.entries(identifiers).reduce((acc, [key, value]) => {
    if (value === null || value === undefined) {
      acc[key] = null;
    } else {
      const trimmed = String(value).trim();
      acc[key] = trimmed || null;
    }
    return acc;
  }, {});
}

function formatMetrics(input = {}) {
  const worksCount =
    input.works_count !== undefined && input.works_count !== null
      ? toOptionalInteger(input.works_count)
      : toOptionalInteger(input.total_works);

  return {
    works_count: worksCount === null ? 0 : worksCount,
    latest_publication_year: toOptionalInteger(
      input.latest_publication_year !== undefined
        ? input.latest_publication_year
        : input.most_recent_publication_year
    )
  };
}

function formatPersonListItem(row = {}) {
  return {
    id: toOptionalInteger(row.id),
    preferred_name: row.preferred_name || null,
    given_names: row.given_names || null,
    family_name: row.family_name || null,
    name_signature: row.name_signature || null,
    // Explicit identifier fields
    orcid: row.orcid || row.identifiers?.orcid || null,
    lattes_id: row.lattes_id || row.identifiers?.lattes_id || null,
    scopus_id: row.scopus_id || row.identifiers?.scopus_id || null,
    wikidata_id: row.wikidata_id || row.identifiers?.wikidata_id || null,
    openalex_id: row.openalex_id || row.identifiers?.openalex_id || null,
    mag_id: row.mag_id || row.identifiers?.mag_id || null,
    url: row.url || row.identifiers?.url || null,
    identifiers: normalizeIdentifiers(row),
    is_verified: toOptionalBoolean(
      row.is_verified !== undefined ? row.is_verified : row.verified
    ),
    metrics: formatMetrics(row.metrics || {
      works_count: row.works_count,
      latest_publication_year: row.latest_publication_year
    })
  };
}

function formatSubjectExpertise(items = []) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.map(item => ({
    subject_id: item.subject_id || item.id || null,
    term: item.term || null,
    vocabulary: item.vocabulary || null,
    works_count: toOptionalInteger(item.works_count) || 0
  }));
}

function formatCollaborators(items = []) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.map(item => ({
    person_id: toOptionalInteger(item.person_id),
    preferred_name: item.preferred_name || item.name || null,
    shared_works_count: toOptionalInteger(item.shared_works_count) || 0
  }));
}

function formatRecentWorks(items = []) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.map(work => ({
    id: toOptionalInteger(work.id),
    title: work.title || null,
    subtitle: work.subtitle || null,
    type: work.type || work.work_type || null,
    language: work.language || null,
    year: toOptionalInteger(work.year),
    doi: work.doi || null,
    role: work.role || null,
    position: toOptionalInteger(work.position),
    venue: work.venue
      ? {
          id: toOptionalInteger(work.venue.id),
          name: work.venue.name || null,
          type: work.venue.type || null
        }
      : null
  }));
}

function formatAuthorshipProfile(raw = {}) {
  if (!raw || typeof raw !== 'object') {
    return {
      works_count: 0,
      author_count: 0,
      editor_count: 0,
      total_citations: null,
      open_access_works: null,
      first_publication_year: null,
      latest_publication_year: null,
      h_index: null
    };
  }

  return {
    works_count: toOptionalInteger(raw.works_count) || 0,
    author_count: toOptionalInteger(
      raw.author_count !== undefined ? raw.author_count : raw.total_author_roles
    ) || 0,
    editor_count: toOptionalInteger(raw.editor_count) || 0,
    total_citations: raw.total_citations !== undefined
      ? toOptionalInteger(raw.total_citations)
      : null,
    open_access_works: raw.open_access_works !== undefined
      ? toOptionalInteger(raw.open_access_works)
      : null,
    first_publication_year: toOptionalInteger(raw.first_publication_year),
    latest_publication_year: toOptionalInteger(raw.latest_publication_year),
    h_index: raw.h_index !== undefined ? toOptionalInteger(raw.h_index) : null
  };
}

function formatPrimaryAffiliation(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  if (!raw.organization_id && !raw.id) {
    return null;
  }

  return {
    id: toOptionalInteger(raw.organization_id || raw.id),
    name: raw.name || raw.organization_name || null,
    type: raw.type || null,
    country_code: raw.country_code || raw.country || null
  };
}

function formatPersonDetails(person = {}) {
  const identifiers = normalizeIdentifiers(person);
  const nameVariations = [];
  const metrics = formatMetrics(
    person.metrics || {
      works_count: person.works_count,
      latest_publication_year: person.latest_publication_year
    }
  );

  return {
    id: toOptionalInteger(person.id),
    preferred_name: person.preferred_name || null,
    given_names: person.given_names || null,
    family_name: person.family_name || null,
    name_variations: ensureArrayOfStrings(person.name_variations || []),
    name_signature: person.name_signature || null,
    // Explicit identifier fields
    orcid: person.orcid || identifiers.orcid || null,
    lattes_id: person.lattes_id || identifiers.lattes_id || null,
    scopus_id: person.scopus_id || identifiers.scopus_id || null,
    wikidata_id: person.wikidata_id || identifiers.wikidata_id || null,
    openalex_id: person.openalex_id || identifiers.openalex_id || null,
    mag_id: person.mag_id || identifiers.mag_id || null,
    url: person.url || identifiers.url || null,
    identifiers,
    is_verified: toOptionalBoolean(person.is_verified),
    metrics,
    primary_affiliation: formatPrimaryAffiliation(person.primary_affiliation),
    authorship_profile: formatAuthorshipProfile(person.authorship_profile || {
      works_count: person.metrics?.works_count ?? person.works_count,
      author_count: person.metrics?.author_count ?? person.author_count,
      editor_count: person.metrics?.editor_count ?? person.editor_count,
      first_publication_year: person.metrics?.first_publication_year ?? person.first_publication_year,
      latest_publication_year: person.metrics?.latest_publication_year ?? person.latest_publication_year
    }),
    subject_expertise: formatSubjectExpertise(person.subject_expertise),
    top_collaborators: formatCollaborators(person.top_collaborators),
    recent_works: formatRecentWorks(person.recent_works),
    created_at: person.created_at || null,
    updated_at: person.updated_at || null
  };
}

module.exports = { formatPersonListItem, formatPersonDetails };
