SELECT p.plot_id,
  ROUND((ST_Area(ST_Intersection(p.boundary, b.geom)::geography)
       / ST_Area(p.boundary::geography) * 100)::numeric, 2) AS overlap_pct
FROM plots p JOIN satellite_baseline b ON b.region_code = p.region_code;
-- expected: P001 about 95, P002 about 75

SELECT record_flag_audit('P002', 75.0, 90.0, 'Overlap below 90% threshold', 'Clean', 'Flagged');
SELECT * FROM flag_audit ORDER BY id;

UPDATE flag_audit SET flag_reason = 'x';
-- must fail with: flag_audit is append-only