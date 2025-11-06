-- Ethnos_API performance indexes for Works and related entities
-- Safe/idempotent: uses IF NOT EXISTS where supported (MariaDB 10.5+)
-- Scope: optimize /works/{id} enrichment queries

-- publications: accelerate latest-per-work lookups and year filters
CREATE INDEX IF NOT EXISTS idx_publications_work_year ON publications(work_id, year);

-- authorships: fetch authors ordered by position for a work
CREATE INDEX IF NOT EXISTS idx_authorships_work_position ON authorships(work_id, position);

-- work_subjects: fetch subjects by work with relevance ordering
-- Note: PRIMARY KEY (work_id, subject_id) covers lookups; this composite helps ORDER BY relevance
CREATE INDEX IF NOT EXISTS idx_work_subjects_work_relevance ON work_subjects(work_id, relevance_score);

-- funding: relationship scan by work/funder (expected present in schema)
CREATE INDEX IF NOT EXISTS idx_funding_work_funder ON funding(work_id, funder_id);

-- citations: directional scans for cited_by and references
CREATE INDEX IF NOT EXISTS idx_citations_cited_work ON citations(cited_work_id);
CREATE INDEX IF NOT EXISTS idx_citations_citing_work ON citations(citing_work_id);

-- publication_files: filter files by publication
-- Note: PRIMARY KEY (publication_id, file_id) already covers this; index below is redundant in most setups
CREATE INDEX IF NOT EXISTS idx_publication_files_publication_id ON publication_files(publication_id);

-- Optional supporting indexes already common in this repo (reference)
-- CREATE INDEX IF NOT EXISTS idx_publications_year ON publications(year);
-- CREATE INDEX IF NOT EXISTS idx_publications_work_year_id ON publications(work_id, year DESC, id DESC);

