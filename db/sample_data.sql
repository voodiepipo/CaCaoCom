INSERT INTO satellite_source (name, provider, cutoff_date, notes)
VALUES ('JRC Global Forest Cover 2020 (V4)', 'EU Joint Research Centre', '2020-12-31',
        'Real tile N10_W10 clipped to a 0.1 degree area. Fallback below is a simplified patch.');

-- Fallback baseline: a circle approximating the largest forest patch of the real tile
INSERT INTO satellite_baseline (source_id, region_code, baseline_date, geom)
VALUES (1, 'WA01', '2020-12-31',
  ST_Multi(ST_Buffer(ST_SetSRID(ST_MakePoint(-2.535858, 6.157492), 4326), 0.00746, 16)));

INSERT INTO plots (plot_id, farmer_id, region_code, land_area_ha, boundary) VALUES
('P001','F001','WA01',99.0, ST_MakeEnvelope(-2.540358, 6.152992, -2.531358, 6.161992, 4326)),
('P002','F002','WA01',99.0, ST_MakeEnvelope(-2.532358, 6.152992, -2.523358, 6.161992, 4326));