#!/usr/bin/env node
/**
 * Validates that the minimum database structures required by the API exist.
 * Checks tables, columns, views, and critical indexes referenced by the
 * service layer and endpoint tests.
 */

const path = require('path');
const mysql = require('mysql2/promise');

try {
  // Prefer system-wide env file
  require('dotenv').config({ path: '/etc/node-backend.env' });
} catch (error) {
  // dotenv is optional; ignore if not available
}

const REQUIRED_TABLES = {
  works: {
    columns: ['id', 'title', 'work_type', 'language', 'created_at'],
    indexes: ['PRIMARY', 'idx_work_type', 'idx_language', 'idx_works_title_normalized']
  },
  publications: {
    columns: ['id', 'work_id', 'year', 'doi'],
    indexes: ['PRIMARY', 'idx_publications_work_year', 'idx_publications_year']
  },
  work_subjects: {
    columns: ['work_id', 'subject_id', 'relevance_score'],
    indexes: ['PRIMARY', 'idx_subject', 'idx_relevance', 'idx_work_subjects_subject_work', 'idx_work_subjects_work_relevance']
  },
  subjects: {
    columns: ['id', 'term', 'vocabulary', 'parent_id'],
    indexes: ['PRIMARY']
  },
  course_bibliography: {
    columns: ['course_id', 'work_id', 'reading_type'],
    indexes: ['PRIMARY', 'idx_work', 'idx_type']
  },
  organizations: {
    columns: ['id', 'name', 'type', 'country_code'],
    indexes: ['PRIMARY']
  },
  authorships: {
    columns: ['work_id', 'person_id', 'affiliation_id', 'role'],
    indexes: ['PRIMARY', 'idx_authorships_work_position', 'idx_authorships_person_role']
  },
  funding: {
    columns: ['work_id', 'funder_id', 'grant_number'],
    indexes: ['PRIMARY', 'idx_funding_work_funder']
  },
  citations: {
    columns: ['citing_work_id', 'cited_work_id', 'citation_type'],
    indexes: ['PRIMARY', 'idx_citations_cited_work', 'idx_citations_citing_work']
  },
  publication_files: {
    columns: ['publication_id', 'file_id', 'file_role', 'quality'],
    indexes: ['PRIMARY', 'idx_publication_files_publication_id']
  },
  persons: {
    columns: ['id', 'preferred_name', 'is_verified'],
    indexes: ['PRIMARY', 'idx_persons_preferred_name', 'idx_persons_verified']
  },
  work_author_summary: {
    columns: ['work_id', 'author_string', 'first_author_id'],
    indexes: ['PRIMARY', 'idx_first_author']
  },
  venues: {
    columns: ['id', 'name', 'type', 'impact_factor'],
    indexes: ['PRIMARY', 'idx_venues_type_impact']
  },
  signatures: {
    columns: ['id', 'signature'],
    indexes: ['PRIMARY']
  }
};

// Optional Sphinx resources. In simplified deployments we use sphinx_*_summary tables
// instead of v_sphinx_* views. Treat as warnings if neither alternative exists.
const OPTIONAL_SPHINX_RESOURCES = [
  ['v_sphinx_works_index', 'sphinx_works_summary'],
  ['v_sphinx_persons_index', 'sphinx_persons_summary'],
  ['v_sphinx_publications_index'] // optional; not required in unified config
];

function formatResult(result) {
  return result ? 'ok' : 'missing';
}

async function main() {
  const {
    DB_HOST = 'localhost',
    DB_PORT = '3306',
    DB_USER,
    DB_PASSWORD,
    DB_NAME
  } = process.env;

  if (!DB_USER || !DB_PASSWORD || !DB_NAME) {
    console.error('[data-check] Missing DB credentials. Ensure DB_USER, DB_PASSWORD, and DB_NAME are set.');
    process.exit(2);
  }

  const connection = await mysql.createConnection({
    host: DB_HOST,
    port: Number(DB_PORT),
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    namedPlaceholders: true
  });

  const errors = [];
  const warnings = [];

  try {
    const [tableRows] = await connection.query('SHOW TABLES');
    const tableNameKey = Object.keys(tableRows[0] || { 'Tables_in_db': '' })[0];
    const availableTables = new Set(tableRows.map(row => row[tableNameKey]));

    for (const [table, expectations] of Object.entries(REQUIRED_TABLES)) {
      if (!availableTables.has(table)) {
        errors.push(`Table ${table} not found`);
        continue;
      }

      const [columnRows] = await connection.query(`SHOW COLUMNS FROM \`${table}\``);
      const columns = new Set(columnRows.map(row => row.Field));
      const missingColumns = expectations.columns.filter(c => !columns.has(c));
      if (missingColumns.length) {
        errors.push(`Table ${table} missing columns: ${missingColumns.join(', ')}`);
      }

      if (expectations.indexes && expectations.indexes.length) {
        const [indexRows] = await connection.query(`SHOW INDEX FROM \`${table}\``);
        const indexes = new Set(indexRows.map(row => row.Key_name));
        const missingIndexes = expectations.indexes.filter(idx => !indexes.has(idx));
        if (missingIndexes.length) {
          warnings.push(`Table ${table} missing expected indexes: ${missingIndexes.join(', ')}`);
        }
      }
    }

    const [viewRows] = await connection.query("SHOW FULL TABLES WHERE TABLE_TYPE = 'VIEW'");
    const viewNameKey = Object.keys(viewRows[0] || { 'Tables_in_db': '' })[0];
    const availableViews = new Set(viewRows.map(row => row[viewNameKey]));

    // Also read regular tables to allow table alternatives for Sphinx
    const [tblRows] = await connection.query('SHOW TABLES');
    const tblNameKey = Object.keys(tblRows[0] || { 'Tables_in_db': '' })[0];
    const availableTbls = new Set(tblRows.map(row => row[tblNameKey]));

    for (const group of OPTIONAL_SPHINX_RESOURCES) {
      const ok = group.some(name => availableViews.has(name) || availableTbls.has(name));
      if (!ok) {
        warnings.push(`Optional Sphinx resource missing: one of [${group.join(', ')}]`);
      }
    }

    console.log('Data integrity summary');
    console.log('=======================');
    console.log(`Tables checked: ${Object.keys(REQUIRED_TABLES).length}`);
    console.log(`Optional Sphinx resources groups: ${OPTIONAL_SPHINX_RESOURCES.length}`);
    console.log(`Tables present: ${Object.keys(REQUIRED_TABLES).filter(t => availableTables.has(t)).length}`);
    console.log(`Views present: ${viewRows.length}`);

    if (warnings.length) {
      console.log('\nWarnings:');
      warnings.forEach(w => console.log(`  - ${w}`));
    }

    if (errors.length) {
      console.error('\nErrors:');
      errors.forEach(err => console.error(`  - ${err}`));
      process.exit(1);
    }

    console.log('\nStatus: OK');
  } catch (error) {
    console.error('[data-check] Unexpected error:', error.message);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

main();
