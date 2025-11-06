USE data_db;
DROP VIEW IF EXISTS v_venue_ranking;
CREATE ALGORITHM=UNDEFINED DEFINER=`api_dev`@`localhost` SQL SECURITY DEFINER VIEW v_venue_ranking AS
SELECT
  p.venue_id AS venue_id,
  v.name AS venue_name,
  v.type AS venue_type,
  COUNT(DISTINCT p.work_id) AS total_works,
  COUNT(DISTINCT a.person_id) AS unique_authors,
  MIN(p.year) AS first_publication_year,
  MAX(p.year) AS latest_publication_year,
  SUM(CASE WHEN p.open_access = 1 THEN 1 ELSE 0 END) AS open_access_works,
  CASE WHEN COUNT(0) > 0 THEN ROUND(SUM(p.open_access = 1) * 100.0 / COUNT(0), 1) ELSE NULL END AS open_access_percentage
FROM publications p
LEFT JOIN venues v ON v.id = p.venue_id
LEFT JOIN authorships a ON a.work_id = p.work_id
GROUP BY
  p.venue_id,
  v.name,
  v.type;
