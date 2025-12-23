const coalesce = (...values) => {
  for (const value of values) {
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  return null;
};

const toBoolean = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (Number.isNaN(value)) {
      return null;
    }
    return value === 1;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') {
      return true;
    }
    if (normalized === 'false' || normalized === '0') {
      return false;
    }
  }

  return null;
};

const toInteger = (value, fallback = 0) => {
  if (value === null || value === undefined) {
    return fallback;
  }

  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const toNullableNumber = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const cleanPublisher = (rawPublisher = {}) => {
  const publisher = {
    id: coalesce(rawPublisher.id, rawPublisher.publisher_id),
    name: coalesce(rawPublisher.name, rawPublisher.publisher_name),
    type: coalesce(rawPublisher.type, rawPublisher.publisher_type),
    country_code: coalesce(rawPublisher.country_code, rawPublisher.publisher_country)
  };

  const hasData = Object.values(publisher).some((value) => value !== null && value !== undefined);
  return hasData ? publisher : null;
};

const buildExternalIdentifiers = (venue = {}) => {
  const identifiers = venue.identifiers || {};
  const externalList = Array.isArray(venue.external_identifiers) ? venue.external_identifiers : [];
  const existingExternal = identifiers.external || {};

  return externalList.reduce((acc, item) => {
    if (!item || typeof item !== 'object') {
      return acc;
    }

    const key = item.identifier_type || item.type;
    const value = item.value || item.identifier_value;

    if (key && value && !acc[key]) {
      acc[key] = value;
    }

    return acc;
  }, { ...existingExternal });
};

const buildIdentifiers = (venue = {}) => {
  const identifiers = venue.identifiers || {};

  return {
    issn: coalesce(venue.issn, identifiers.issn),
    eissn: coalesce(venue.eissn, identifiers.eissn),
    scopus_source_id: coalesce(venue.scopus_source_id, identifiers.scopus_source_id),
    external: buildExternalIdentifiers(venue)
  };
};

const buildPublicationSummary = (venue = {}) => {
  const summary = venue.publication_summary || {};
  const trend = Array.isArray(summary.publication_trend)
    ? summary.publication_trend.map((entry) => ({
        year: entry?.year ?? null,
        works_count: toInteger(entry?.works_count),
        oa_works_count: toInteger(entry?.oa_works_count)
      }))
    : [];

  return {
    first_publication_year: summary.first_publication_year ?? venue.coverage_start_year ?? null,
    latest_publication_year: summary.latest_publication_year ?? venue.coverage_end_year ?? null,
    publication_trend: trend
  };
};

const buildLegacyMetrics = (venue = {}) => ({
  impact_factor: venue.impact_factor ?? null,
  sjr: venue.sjr ?? null,
  snip: venue.snip ?? null,
  citescore: venue.citescore ?? null
});

const buildSummarySnapshot = (venue = {}) => {
  const summary = venue.summary_snapshot;
  if (!summary || typeof summary !== 'object') {
    return null;
  }

  const hasContent = Object.values(summary).some(
    (value) => value !== null && value !== undefined && value !== ''
  );

  if (!hasContent) {
    return null;
  }

  return {
    id: summary.id ?? venue.id ?? null,
    name: summary.name ?? venue.name ?? null,
    type: summary.type ?? venue.type ?? null,
    publisher_name: summary.publisher_name ?? venue.publisher_name ?? venue.publisher?.name ?? null,
    country_code: summary.country_code ?? venue.country_code ?? venue.publisher_country ?? null,
    issn: summary.issn ?? venue.issn ?? null,
    eissn: summary.eissn ?? venue.eissn ?? null,
    subjects_string: summary.subjects_string ?? null,
    top_works_string: summary.top_works_string ?? null,
    works_count: summary.works_count !== undefined && summary.works_count !== null
      ? toInteger(summary.works_count, null)
      : null,
    cited_by_count: summary.cited_by_count !== undefined && summary.cited_by_count !== null
      ? toInteger(summary.cited_by_count, null)
      : null,
    impact_factor: summary.impact_factor ?? null,
    h_index: summary.h_index !== undefined && summary.h_index !== null
      ? toInteger(summary.h_index, null)
      : null,
    open_access_percentage: summary.open_access_percentage ?? null,
    last_updated: summary.last_updated ?? null
  };
};

const baseVenue = (venue = {}, options = {}) => {
  const summarySnapshot = buildSummarySnapshot(venue);
  const base = {
    id: venue.id,
    name: venue.name,
    type: venue.type,
    open_access: toBoolean(venue.open_access),
    works_count: toInteger(
      coalesce(
        summarySnapshot?.works_count,
        venue.works_count,
        venue.metrics?.works_count
      )
    ),
    issn: coalesce(venue.issn, venue.identifiers?.issn),
    eissn: coalesce(venue.eissn, venue.identifiers?.eissn),
    scopus_source_id: coalesce(venue.scopus_source_id, venue.identifiers?.scopus_source_id),
    scopus_id: coalesce(venue.scopus_id, venue.scopus_source_id, venue.identifiers?.scopus_source_id),
    wikidata_id: venue.wikidata_id || null,
    openalex_id: venue.openalex_id || null,
    mag_id: venue.mag_id || null,
    homepage_url: venue.homepage_url || null,
    aggregation_type: venue.aggregation_type || null,
    coverage_start_year: venue.coverage_start_year ?? null,
    coverage_end_year: venue.coverage_end_year ?? null,
    country_code: venue.country_code || null,
    is_in_doaj: toBoolean(venue.is_in_doaj),
    is_indexed_in_scopus: toBoolean(venue.is_indexed_in_scopus),
    cited_by_count: toInteger(
      coalesce(
        venue.cited_by_count,
        summarySnapshot?.cited_by_count
      ),
      0
    ),
    h_index: toInteger(
      coalesce(
        venue.h_index,
        summarySnapshot?.h_index
      ),
      0
    ),
    i10_index: toInteger(venue.i10_index, 0),
    two_year_mean_citedness: venue.two_year_mean_citedness ?? null,
    open_access_percentage: summarySnapshot?.open_access_percentage ?? toNullableNumber(venue.open_access_percentage),
    identifiers: buildIdentifiers(venue),
    publisher: cleanPublisher({
      id: venue.publisher_id,
      name: venue.publisher_name,
      type: venue.publisher_type,
      country_code: venue.publisher_country,
      ...(venue.publisher || {})
    }),
    summary_snapshot: summarySnapshot
  };

  if (options.includeLegacyMetrics) {
    base.legacy_metrics = buildLegacyMetrics(venue);
  }

  return base;
};

const mapSubject = (subject = {}) => ({
  subject_id: subject?.subject_id ?? null,
  term: subject?.term || null,
  score: subject?.score ?? null
});

const collectSubjectCollections = (subjects = [], options = {}) => {
  if (!Array.isArray(subjects) || subjects.length === 0) {
    return { subjects: [], terms: [], keywords: [] };
  }

  const limit = Number.isInteger(options.limit) ? options.limit : undefined;
  const trimmed = limit !== undefined ? subjects.slice(0, limit) : subjects.slice();

  const mapped = trimmed
    .map(mapSubject)
    .filter((subject) => subject.subject_id !== null || subject.term !== null);

  const terms = mapped
    .map((subject) => (subject.term || '').trim())
    .filter((term) => term.length > 0);

  const keywords = [];
  const seen = new Set();
  for (const term of terms) {
    const normalized = term.toLowerCase();
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    keywords.push(term);
  }

  return {
    subjects: mapped,
    terms,
    keywords
  };
};

function formatVenueListItem(venue = {}, options = {}) {
  const includeSubjects = options.includeSubjects !== false;
  const subjectsLimit = Number.isInteger(options.subjectsLimit) ? options.subjectsLimit : 5;

  const result = baseVenue(venue, {
    includeLegacyMetrics: Boolean(options.includeLegacyMetrics)
  });

  if (includeSubjects) {
    const source = Array.isArray(venue.subjects) && venue.subjects.length
      ? venue.subjects
      : Array.isArray(venue.top_subjects)
        ? venue.top_subjects
        : [];
    const collections = collectSubjectCollections(source, { limit: subjectsLimit });
    result.subjects = collections.subjects;
    result.terms = collections.terms;
    result.keywords = collections.keywords;
  }

  return result;
}

function formatVenueDetails(venue = {}, options = {}) {
  const detail = {
    ...baseVenue(venue, {
      includeLegacyMetrics: Boolean(options.includeLegacyMetrics)
    }),
    created_at: venue.created_at || null,
    updated_at: venue.updated_at || null,
    validation_status: venue.validation_status || null,
    last_validated_at: venue.last_validated_at || null,
    publication_summary: buildPublicationSummary(venue)
  };

  if (options.includeYearlyStats) {
    detail.yearly_stats = Array.isArray(venue.yearly_stats)
      ? venue.yearly_stats.map((item) => ({
          year: item?.year ?? null,
          works_count: toInteger(item?.works_count),
          oa_works_count: toInteger(item?.oa_works_count),
          cited_by_count: toInteger(item?.cited_by_count)
        }))
      : [];
  }

  if (options.includeSubjects) {
    const source = Array.isArray(venue.subjects) && venue.subjects.length
      ? venue.subjects
      : Array.isArray(venue.top_subjects)
        ? venue.top_subjects
        : [];
    const collections = collectSubjectCollections(source);
    detail.subjects = collections.subjects;
    detail.terms = collections.terms;
    detail.keywords = collections.keywords;
    detail.top_subjects = collections.subjects.slice(0, 10);
  }

  if (options.includeTopAuthors) {
    detail.top_authors = Array.isArray(venue.top_authors)
      ? venue.top_authors.map((author) => ({
          person_id: author?.person_id ?? null,
          name: author?.name || null,
          works_count: toInteger(author?.works_count),
          best_position: toInteger(author?.best_position, null),
          is_corresponding: toBoolean(author?.is_corresponding)
        }))
      : [];
  }

  if (Array.isArray(options.recentWorks)) {
    detail.recent_works = options.recentWorks.map((w) => ({
      id: w.id,
      title: w.title,
      subtitle: w.subtitle ?? null,
      abstract: w.abstract ?? null,
      type: w.type,
      language: w.language ?? null,
      year: toInteger(w.year, null),
      volume: w.volume ?? null,
      issue: w.issue ?? null,
      pages: w.pages ?? null,
      doi: w.doi ?? null,
      open_access: toBoolean(w.open_access),
      peer_reviewed: toBoolean(w.peer_reviewed),
      publication_date: w.publication_date ?? null,
      author_count: toInteger(w.author_count, 0),
      authors: Array.isArray(w.authors) ? w.authors.map(a => ({
        person_id: a.person_id,
        name: a.name,
        position: toInteger(a.position, 0),
        is_corresponding: toBoolean(a.is_corresponding)
      })) : []
    }));
  }

  return detail;
}

module.exports = {
  formatVenueListItem,
  formatVenueDetails
};
