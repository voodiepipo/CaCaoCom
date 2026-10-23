CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TYPE plot_status AS ENUM ('Clean','Flagged','Under Review','Cleared','Mismatch');

-- 009.1: where the satellite baseline comes from
CREATE TABLE satellite_source (
  id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  provider VARCHAR(100),
  cutoff_date DATE NOT NULL,
  notes VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 009.1: baseline forest area (accepts Polygon or MultiPolygon)
CREATE TABLE satellite_baseline (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_id INT NOT NULL REFERENCES satellite_source(id),
  region_code VARCHAR(20),
  baseline_date DATE NOT NULL,
  geom geometry(Geometry, 4326) NOT NULL
);
CREATE INDEX idx_baseline_geom ON satellite_baseline USING GIST (geom);

-- minimal plots table (replace if the team already has one)
CREATE TABLE plots (
  plot_id VARCHAR(20) PRIMARY KEY,
  farmer_id VARCHAR(20),
  region_code VARCHAR(20),
  land_area_ha NUMERIC(10,2),
  boundary geometry(Polygon, 4326) NOT NULL,
  status plot_status NOT NULL DEFAULT 'Clean'
);
CREATE INDEX idx_plot_boundary ON plots USING GIST (boundary);

-- 009.1: overlap result per plot
CREATE TABLE plot_overlap_result (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  plot_id VARCHAR(20) NOT NULL REFERENCES plots(plot_id),
  baseline_id BIGINT NOT NULL REFERENCES satellite_baseline(id),
  overlap_pct NUMERIC(5,2) NOT NULL CHECK (overlap_pct BETWEEN 0 AND 100),
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 009.2: flag reason + audit entry (append-only)
CREATE TABLE flag_audit (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  plot_id VARCHAR(20) NOT NULL REFERENCES plots(plot_id),
  overlap_pct NUMERIC(5,2),
  threshold_pct NUMERIC(5,2),
  flag_reason VARCHAR(255) NOT NULL,
  previous_status plot_status,
  new_status plot_status NOT NULL,
  agent_id VARCHAR(20) NOT NULL DEFAULT 'SYSTEM',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE FUNCTION flag_audit_block() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'flag_audit is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER flag_audit_no_change
  BEFORE UPDATE OR DELETE ON flag_audit
  FOR EACH ROW EXECUTE FUNCTION flag_audit_block();

CREATE TRIGGER flag_audit_no_truncate
  BEFORE TRUNCATE ON flag_audit
  FOR EACH STATEMENT EXECUTE FUNCTION flag_audit_block();

-- 009.2: saves one audit row (Nuttanun's flag code calls this after setting the status)
CREATE OR REPLACE FUNCTION record_flag_audit(
  p_plot_id VARCHAR, p_overlap NUMERIC, p_threshold NUMERIC,
  p_reason VARCHAR, p_prev plot_status, p_new plot_status,
  p_agent VARCHAR DEFAULT 'SYSTEM'
) RETURNS BIGINT AS $$
  INSERT INTO flag_audit (plot_id, overlap_pct, threshold_pct, flag_reason,
                          previous_status, new_status, agent_id)
  VALUES (p_plot_id, p_overlap, p_threshold, p_reason, p_prev, p_new, p_agent)
  RETURNING id;
$$ LANGUAGE sql;