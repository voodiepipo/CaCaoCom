INSERT INTO satellite_source (name, provider, cutoff_date, notes)
VALUES ('JRC Global Forest Cover 2020', 'EU Joint Research Centre', '2020-12-31', 'Sample region for development');

INSERT INTO satellite_baseline (source_id, region_code, baseline_date, geom)
VALUES (1, 'WA01', '2020-12-31',
  ST_GeomFromText('POLYGON((-1.60 6.70,-1.59 6.70,-1.59 6.7095,-1.60 6.7095,-1.60 6.70))', 4326));

INSERT INTO plots (plot_id, farmer_id, region_code, land_area_ha, boundary) VALUES
('P001','F001','WA01',110.0,
  ST_GeomFromText('POLYGON((-1.60 6.70,-1.59 6.70,-1.59 6.71,-1.60 6.71,-1.60 6.70))', 4326)),
('P002','F002','WA01',110.0,
  ST_GeomFromText('POLYGON((-1.60 6.702,-1.59 6.702,-1.59 6.712,-1.60 6.712,-1.60 6.702))', 4326));