function toOptionalBoolean(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value === 1;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return null;
    }
    return ['1', 'true', 'yes', 'y'].includes(normalized);
  }
  return null;
}

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
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed.toUpperCase() : null;
  }
  return String(value).toUpperCase();
}

function normalizeVenue(raw = {}) {
  if (!raw) {
    return null;
  }

  const name = raw.name || raw.venue_name;
  if (!name) {
    return null;
  }

  return {
    id: raw.id || null,
    name,
    type: normalizeType(raw.type || raw.venue_type),
    issn: raw.issn || null,
    eissn: raw.eissn || null
  };
}

function ensureAuthorsPreview(row = {}) {
  if (Array.isArray(row.authors_preview)) {
    return row.authors_preview.map(author => (author ? String(author).trim() : '')).filter(Boolean);
  }

  if (typeof row.author_string === 'string' && row.author_string.trim()) {
    return row.author_string
      .split(';')
      .map(author => author.trim())
      .filter(Boolean)
      .slice(0, 3);
  }

  return [];
}

function formatWorkListItem(row = {}) {
  const authorsPreview = ensureAuthorsPreview(row);
  const authorCountSource =
    row.author_count !== undefined && row.author_count !== null
      ? toOptionalInteger(row.author_count)
      : Array.isArray(row.authors)
        ? row.authors.length
        : authorsPreview.length;

  const publicationYear = toOptionalInteger(row.publication_year);
  const venue = normalizeVenue(row.venue || { name: row.venue_name, type: row.venue_type });

  return {
    id: toOptionalInteger(row.id),
    title: row.title || null,
    subtitle: row.subtitle || null,
    abstract: row.abstract || null,
    type: normalizeType(row.type || row.work_type),
    language: row.language || null,
    publication_year: publicationYear,
    doi: row.doi || null,
    pmid: row.pmid || null,
    pmcid: row.pmcid || null,
    arxiv: row.arxiv || null,
    wos_id: row.wos_id || null,
    handle: row.handle || null,
    url: row.url || null,
    wikidata_id: row.wikidata_id || null,
    openalex_id: row.openalex_id || null,
    mag_id: row.mag_id || null,
    open_access: toOptionalBoolean(row.open_access),
    peer_reviewed: toOptionalBoolean(row.peer_reviewed),
    venue,
    authors_preview: authorsPreview,
    author_count: authorCountSource,
    first_author: row.first_author || (authorsPreview.length > 0 ? authorsPreview[0] : null),
    first_author_id: toOptionalInteger(row.first_author_id),
    first_author_identifiers: row.first_author_identifiers || null,
    added_to_database: row.added_to_database || row.created_at || null,
    data_source: row.data_source || null,
    search_engine: row.search_engine || null
  };
}

function formatWorkDetails(work = {}) {
  const publication = work.publication || {};
  const venue = normalizeVenue(work.venue);
  const publisher = work.publisher && work.publisher.name
    ? {
        id: work.publisher.id || null,
        name: work.publisher.name,
        type: work.publisher.type ? normalizeType(work.publisher.type) : null,
        country: work.publisher.country || null
      }
    : null;

  const authors = Array.isArray(work.authors)
    ? work.authors.map(author => {
        const preferredName =
          author.preferred_name ||
          author.name ||
          [author.given_names, author.family_name]
            .filter(Boolean)
            .map(part => part.trim())
            .filter(Boolean)
            .join(' ') ||
          null;

        const affiliation =
          author.affiliation && author.affiliation.name
            ? {
                id: author.affiliation.id || null,
                name: author.affiliation.name,
                type: author.affiliation.type ? normalizeType(author.affiliation.type) : null,
                country: author.affiliation.country || null
              }
            : null;

        const identifiers = author.identifiers && typeof author.identifiers === 'object'
          ? author.identifiers
          : {
              orcid: author.orcid || null,
              scopus_id: author.scopus_id || null,
              lattes_id: author.lattes_id || null
            };

        return {
          person_id: author.person_id || null,
          preferred_name: preferredName,
          given_names: author.given_names || null,
          family_name: author.family_name || null,
          identifiers,
          role: author.role || 'AUTHOR',
          position: toOptionalInteger(author.position),
          is_corresponding: toOptionalBoolean(author.is_corresponding),
          affiliation
        };
      })
    : [];

  const subjects = Array.isArray(work.subjects)
    ? work.subjects.map(subject => ({
        subject_id: subject.subject_id || subject.id || null,
        term: subject.term || null,
        vocabulary: subject.vocabulary || 'KEYWORD',
        lang: subject.lang || null,
        relevance_score:
          subject.relevance_score === null || subject.relevance_score === undefined
            ? 1.0
            : Number(subject.relevance_score),
        assigned_by: subject.assigned_by || 'SYSTEM'
      }))
    : [];

  const citations = work.citations || {};
  const processedCitations = {
    cited_by: Array.isArray(citations.cited_by) && citations.cited_by.length > 0
      ? citations.cited_by.map(citation => ({
          work_id: toOptionalInteger(citation.work_id),
          title: citation.title || null,
          authors: citation.authors || null,
          publication_year: toOptionalInteger(citation.publication_year),
          venue_name: citation.venue_name || null,
          citation_type: citation.citation_type || 'NEUTRAL',
          citation_context: citation.citation_context || null
        }))
      : [],
    references: Array.isArray(citations.references) && citations.references.length > 0
      ? citations.references.map(ref => ({
          work_id: toOptionalInteger(ref.work_id),
          title: ref.title || null,
          authors: ref.authors || null,
          publication_year: toOptionalInteger(ref.publication_year),
          venue_name: ref.venue_name || null,
          doi: ref.doi || null,
          citation_type: ref.citation_type || 'NEUTRAL',
          citation_context: ref.citation_context || null
        }))
      : [],
    unresolved_references: Array.isArray(citations.unresolved_references) && citations.unresolved_references.length > 0
      ? citations.unresolved_references.map(unres => ({
          cited_doi: unres.cited_doi || null,
          status: unres.status || 'PENDING',
          created_at: unres.created_at || null
        }))
      : []
  };

  const funding = Array.isArray(work.funding)
    ? work.funding.map(item => ({
        funder_id: item.funder_id || null,
        funder_name: item.funder_name || null,
        grant_number: item.grant_number || null,
        program_name: item.program_name || null,
        amount:
          item.amount === null || item.amount === undefined
            ? null
            : Number(item.amount),
        currency: item.currency || null
      }))
    : [];

  const files = Array.isArray(work.files)
    ? work.files.map(file => ({
        file_id: file.file_id || file.id || null,
        md5: file.md5 || null,
        sha1: file.sha1 || null,
        sha256: file.sha256 || null,
        crc32: file.crc32 || null,
        edonkey: file.edonkey || null,
        aich: file.aich || null,
        tth: file.tth || null,
        btih: file.btih || null,
        ipfs_cid: file.ipfs_cid || null,
        libgen_id: file.libgen_id || null,
        scimag_id: file.scimag_id || null,
        openacess_id: file.openacess_id || null,
        format: file.format || file.file_format || null,
        version: file.version || null,
        size:
          file.size === null || file.size === undefined
            ? null
            : Number(file.size),
        pages: toOptionalInteger(file.pages),
        language: file.language || file.file_language || null,
        best_oa_url: file.best_oa_url || null,
        role: file.role || file.file_role || 'MAIN',
        quality: file.quality || null,
        download_url: file.download_url || null,
        access_count: toOptionalInteger(file.access_count),
        last_accessed: file.last_accessed || null
      }))
    : [];

  const licenses = Array.isArray(work.licenses)
    ? work.licenses.map(license => ({
        license_url: license.license_url || null,
        content_version: license.content_version || null,
        start_date: license.start_date || null,
        created_at: license.created_at || null
      }))
    : [];

  const identifiers = work.identifiers && typeof work.identifiers === 'object'
    ? Object.keys(work.identifiers).reduce((acc, key) => {
        const values = work.identifiers[key];
        if (Array.isArray(values) && values.length > 0) {
          acc[key] = Array.from(new Set(values.map(value => (value ? String(value).trim() : null)).filter(Boolean)));
        }
        return acc;
      }, {})
    : {};

  const metrics = work.metrics && typeof work.metrics === 'object'
    ? {
        citation_count: toOptionalInteger(work.metrics.citation_count) || 0,
        reference_count: toOptionalInteger(work.metrics.reference_count) || 0,
        download_count: toOptionalInteger(work.metrics.download_count),
        view_count: toOptionalInteger(work.metrics.view_count),
        altmetric_score:
          work.metrics.altmetric_score === null || work.metrics.altmetric_score === undefined
            ? null
            : Number(work.metrics.altmetric_score),
        social_media_mentions: toOptionalInteger(work.metrics.social_media_mentions),
        news_mentions: toOptionalInteger(work.metrics.news_mentions)
      }
    : {
        citation_count: 0,
        reference_count: 0,
        download_count: null,
        view_count: null,
        altmetric_score: null,
        social_media_mentions: null,
        news_mentions: null
      };

  return {
    id: toOptionalInteger(work.id),
    title: work.title || null,
    subtitle: work.subtitle || null,
    abstract: work.abstract || null,
    type: normalizeType(work.type || work.work_type),
    language: work.language || null,
    doi: work.doi || null,
    pmid: work.pmid || null,
    pmcid: work.pmcid || null,
    arxiv: work.arxiv || null,
    wos_id: work.wos_id || null,
    handle: work.handle || null,
    url: work.url || null,
    wikidata_id: work.wikidata_id || null,
    openalex_id: work.openalex_id || null,
    mag_id: work.mag_id || null,
    publication: Object.keys(publication).length
      ? {
          year: toOptionalInteger(publication.year),
          volume: publication.volume || null,
          issue: publication.issue || null,
          pages: publication.pages || null,
          publication_date: publication.publication_date || null,
          peer_reviewed: toOptionalBoolean(publication.peer_reviewed),
          open_access: toOptionalBoolean(publication.open_access),
          doi: publication.doi || work.doi || null,
          source: publication.source || null,
          source_indexed_at: publication.source_indexed_at || null
        }
      : null,
    venue,
    publisher,
    authors,
    subjects,
    citations: processedCitations,
    metrics,
    funding,
    files,
    licenses,
    identifiers,
    created_at: work.created_at || null,
    updated_at: work.updated_at || null
  };
}

module.exports = { formatWorkListItem, formatWorkDetails };
