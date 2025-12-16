/**
 * Instructor DTOs - Standardized data transfer objects for instructor resources
 * Following API v2 conventions: snake_case, consistent structure, list/detail compatible
 */

/**
 * Format instructor item for list endpoints
 * Core fields that appear in both list and detail views
 */
const formatInstructorListItem = (instructor) => {
  if (!instructor) return null;

  return {
    person_id: instructor.person_id || instructor.id,
    preferred_name: instructor.preferred_name || null,
    given_names: instructor.given_names || null,
    family_name: instructor.family_name || null,
    identifiers: {
      orcid: instructor.orcid || null,
      lattes_id: instructor.lattes_id || null,
      scopus_id: instructor.scopus_id || null
    },
    is_verified: Boolean(instructor.is_verified),
    teaching_metrics: {
      courses_taught: parseInt(instructor.courses_taught) || 0,
      programs_count: parseInt(instructor.programs_count) || 0,
      teaching_span: {
        earliest_year: instructor.earliest_year || null,
        latest_year: instructor.latest_year || null
      }
    },
    roles: instructor.roles || [],
    program_ids: instructor.program_ids || []
  };
};

/**
 * Format instructor details for detail endpoint
 * Includes all list fields plus additional detail-specific fields
 */
const formatInstructorDetails = (instructor) => {
  if (!instructor) return null;

  const base = formatInstructorListItem(instructor);
  
  return {
    ...base,
    teaching_metrics: {
      ...base.teaching_metrics,
      bibliography_contributed: parseInt(instructor.bibliography_contributed) || 0
    },
    created_at: instructor.created_at || null
  };
};

/**
 * Format instructor course entry
 */
const formatInstructorCourse = (course) => {
  if (!course) return null;

  return {
    id: course.id,
    code: course.code || null,
    name: course.name || null,
    credits: course.credits || null,
    program_id: course.program_id || null,
    semester: course.semester || null,
    year: course.year || null,
    role: course.role || null,
    metrics: {
      bibliography_count: parseInt(course.bibliography_count) || 0,
      co_instructors_count: parseInt(course.co_instructors_count) || 0
    }
  };
};

/**
 * Format instructor subject expertise
 */
const formatInstructorSubject = (subject) => {
  if (!subject) return null;

  return {
    id: subject.id,
    term: subject.term || null,
    vocabulary: subject.vocabulary || null,
    parent_id: subject.parent_id || null,
    expertise_metrics: {
      courses_count: parseInt(subject.courses_count) || 0,
      works_count: parseInt(subject.works_count) || 0,
      avg_relevance: subject.avg_relevance ? parseFloat(subject.avg_relevance).toFixed(2) : null
    }
  };
};

/**
 * Format instructor bibliography entry
 */
const formatInstructorBibliography = (entry) => {
  if (!entry) return null;

  return {
    work_id: entry.work_id,
    title: entry.title || null,
    publication_year: entry.publication_year || null,
    language: entry.language || null,
    document_type: entry.document_type || null,
    open_access: entry.open_access === true || entry.open_access === 1,
    reading_type: entry.reading_type || null,
    author_count: parseInt(entry.author_count) || 0,
    first_author_name: entry.first_author_name || null,
    authors: entry.authors || [],
    usage_metrics: {
      used_in_courses: parseInt(entry.used_in_courses) || 0
    }
  };
};

/**
 * Format comprehensive instructor statistics/profile
 */
const formatInstructorStatistics = (stats) => {
  if (!stats || !stats.person) return null;

  const person = stats.person;
  const teaching = stats.teaching_profile || {};
  const authorship = stats.authorship_profile || {};

  return {
    person: {
      id: person.id,
      preferred_name: person.preferred_name || null,
      given_names: person.given_names || null,
      family_name: person.family_name || null,
      name_variations: [],
      identifiers: {
        orcid: person.orcid || null,
        lattes_id: person.lattes_id || null,
        scopus_id: person.scopus_id || null
      },
      is_verified: Boolean(person.is_verified),
      created_at: person.created_at || null
    },
    teaching_profile: {
      courses_taught: parseInt(teaching.courses_taught) || 0,
      programs_count: parseInt(teaching.programs_count) || 0,
      bibliography_items_used: parseInt(teaching.bibliography_items_used) || 0,
      unique_collaborators: parseInt(teaching.unique_collaborators) || 0,
      teaching_span: {
        start_year: teaching.teaching_start_year || null,
        end_year: teaching.teaching_end_year || null,
        span_years: teaching.teaching_span_years || 0
      },
      teaching_roles: teaching.teaching_roles || []
    },
    authorship_profile: {
      works_authored: parseInt(authorship.works_authored) || 0,
      unique_signatures: parseInt(authorship.unique_signatures) || 0,
      confirmed_authorships: parseInt(authorship.confirmed_authorships) || 0,
      publication_span: {
        first_year: authorship.first_publication_year || null,
        latest_year: authorship.latest_publication_year || null
      }
    },
    signatures: stats.signatures || [],
    recent_authored_works: stats.recent_authored_works || [],
    bibliography_usage_patterns: stats.bibliography_usage_patterns || [],
    most_used_authors_in_courses: stats.most_used_authors_in_courses || [],
    subject_expertise: stats.subject_expertise || [],
    teaching_collaborators: stats.teaching_collaborators || [],
    combined_statistics: stats.combined_statistics || {}
  };
};

module.exports = {
  formatInstructorListItem,
  formatInstructorDetails,
  formatInstructorCourse,
  formatInstructorSubject,
  formatInstructorBibliography,
  formatInstructorStatistics
};
