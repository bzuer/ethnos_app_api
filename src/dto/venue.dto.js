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

const baseVenue = (venue = {}, options = {}) => {
  const base = {
    id: venue.id,
    name: venue.name,
    type: venue.type,
    open_access: toBoolean(venue.open_access),
    works_count: toInteger(venue.works_count ?? venue.metrics?.works_count),
    issn: coalesce(venue.issn, venue.identifiers?.issn),
    eissn: coalesce(venue.eissn, venue.identifiers?.eissn),
    // Keep legacy scopus_source_id while adding explicit scopus_id
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
    cited_by_count: toInteger(venue.cited_by_count, 0),
    h_index: toInteger(venue.h_index, 0),
    i10_index: toInteger(venue.i10_index, 0),
    two_year_mean_citedness: venue.two_year_mean_citedness ?? null,
    identifiers: buildIdentifiers(venue),
    publisher: cleanPublisher({
      id: venue.publisher_id,
      name: venue.publisher_name,
      type: venue.publisher_type,
      country_code: venue.publisher_country,
      ...(venue.publisher || {})
    })
  };

  if (options.includeLegacyMetrics) {
    base.legacy_metrics = buildLegacyMetrics(venue);
  }

  return base;
};

function formatVenueListItem(venue = {}, options = {}) {
  return baseVenue(venue, {
    includeLegacyMetrics: Boolean(options.includeLegacyMetrics)
  });
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
    detail.top_subjects = Array.isArray(venue.top_subjects)
      ? venue.top_subjects.map((subject) => ({
          subject_id: subject?.subject_id ?? null,
          term: subject?.term || null,
          score: subject?.score ?? null
        }))
      : [];
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
      type: w.type,
      language: w.language ?? null,
      year: toInteger(w.year, null),
      volume: w.volume ?? null,
      issue: w.issue ?? null,
      pages: w.pages ?? null,
      doi: w.doi ?? null,
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
