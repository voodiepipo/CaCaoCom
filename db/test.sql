-- Reset before the demo: UPDATE plots SET status = 'Clean';

-- 1. Source and baseline (009.1)
SELECT id, name, provider, cutoff_date, notes FROM satellite_source;
SELECT id, region_code, baseline_date,
       ROUND((ST_Area(geom::geography) / 10000)::numeric, 1) AS hectares
FROM satellite_baseline;

-- 2. Overlap per plot (P001 should be above 90%, P002 below 90%)
SELECT p.plot_id,
  ROUND((ST_Area(ST_Intersection(p.boundary, b.geom)::geography)
       / ST_Area(p.boundary::geography) * 100)::numeric, 2) AS overlap_pct
FROM plots p JOIN satellite_baseline b ON b.region_code = p.region_code
ORDER BY p.plot_id;

-- 3. Flag P002 and save the audit entry (009.2). Replace 62.5 with P002's overlap from step 2
UPDATE plots SET status = 'Flagged' WHERE plot_id = 'P002';
SELECT record_flag_audit('P002', 62.5, 90.0, 'Overlap below 90% threshold', 'Clean', 'Flagged');
SELECT id, plot_id, overlap_pct, threshold_pct, flag_reason,
       previous_status, new_status, agent_id, created_at
FROM flag_audit ORDER BY id DESC LIMIT 3;

-- 4. The audit log cannot be changed (both must fail with: flag_audit is append-only)
UPDATE flag_audit SET flag_reason = 'edited';
DELETE FROM flag_audit;