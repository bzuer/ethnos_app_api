


const formatCourseListItem = (course) => {
  if (!course) return null;

  return {
    id: course.id,
    code: course.code || null,
    name: course.name || null,
    credits: course.credits || null,
    program_id: course.program_id || null,
    semester: course.semester || null,
    year: course.year || null,
    metrics: {
      instructor_count: parseInt(course.instructor_count) || 0,
      bibliography_count: parseInt(course.bibliography_count) || 0,
      subject_count: parseInt(course.subject_count) || 0
    },
    instructors_preview: course.instructors ? 
      course.instructors.split('; ').slice(0, 3) : [],
    created_at: course.created_at || null
  };
};


const formatCourseDetails = (course, options = {}) => {
  if (!course) return null;

  const base = formatCourseListItem(course);
  
  return {
    ...base,
    source_file: course.source_file || null,
    statistics: course.statistics || null,
    ...(options.bibliography && { bibliography: options.bibliography }),
    ...(options.instructors && { instructors: options.instructors }),
    ...(options.subjects && { subjects: options.subjects }),
    ...(options.bibliography_statistics && { bibliography_statistics: options.bibliography_statistics }),
    ...(options.instructor_statistics && { instructor_statistics: options.instructor_statistics }),
    ...(options.subject_statistics && { subject_statistics: options.subject_statistics })
  };
};


const formatCourseInstructor = (instructor) => {
  if (!instructor) return null;

  return {
    person_id: instructor.canonical_person_id || instructor.person_id,
    preferred_name: instructor.preferred_name || null,
    given_names: instructor.given_names || null,
    family_name: instructor.family_name || null,
    role: instructor.role || null,
    identifiers: {
      orcid: instructor.orcid || null
    },
    is_verified: Boolean(instructor.is_verified)
  };
};


const formatBibliographyEntry = (entry) => {
  if (!entry) return null;

  return {
    work_id: entry.work_id,
    title: entry.title || null,
    publication_year: entry.publication_year || null,
    language: entry.language || null,
    document_type: entry.document_type || null,
    open_access: entry.open_access === true || entry.open_access === 1,
    reading_type: entry.reading_type || null,
    week_number: entry.week_number || null,
    notes: entry.notes || null,
    authors_preview: entry.authors || [],
    author_count: entry.author_count || 0,
    first_author_name: entry.first_author_name || null
  };
};


const formatCourseSubject = (subject) => {
  if (!subject) return null;

  return {
    id: subject.id,
    term: subject.term || null,
    vocabulary: subject.vocabulary || null,
    parent_id: subject.parent_id || null,
    work_count: parseInt(subject.work_count) || 0
  };
};

module.exports = {
  formatCourseListItem,
  formatCourseDetails,
  formatCourseInstructor,
  formatBibliographyEntry,
  formatCourseSubject
};
