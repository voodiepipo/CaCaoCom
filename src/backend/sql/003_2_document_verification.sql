-- 003.2 Verify land documents (owner: Nuttanun, Backend 2)
-- Run after db/schema.sql:  psql farmer_registry -f src/backend/sql/003_2_document_verification.sql
-- Safe to run more than once.

DO $$ BEGIN
  CREATE TYPE document_status AS ENUM ('Pending', 'Approved', 'Rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- One uploaded land document (title deed, tax receipt, ...) for a plot.
-- Full upload (story 004) comes in Sprint 4; for now file_url points to the file.
CREATE TABLE IF NOT EXISTS land_documents (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  plot_id VARCHAR(20) NOT NULL REFERENCES plots(plot_id),
  file_url VARCHAR(500) NOT NULL,
  status document_status NOT NULL DEFAULT 'Pending',
  reviewed_by VARCHAR(20),
  reviewed_at TIMESTAMPTZ,
  reject_reason VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A decision always has a reviewer and a time; a rejection always has a reason.
  CONSTRAINT reviewed_has_reviewer CHECK (status = 'Pending' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
  CONSTRAINT rejected_has_reason CHECK (status <> 'Rejected' OR reject_reason IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_land_documents_plot ON land_documents (plot_id);

-- Append-only history of every decision.
CREATE TABLE IF NOT EXISTS document_audit (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id BIGINT NOT NULL REFERENCES land_documents(id),
  previous_status document_status NOT NULL,
  new_status document_status NOT NULL,
  reason VARCHAR(255),
  reviewer_id VARCHAR(20) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION document_audit_block() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'document_audit is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS document_audit_no_change ON document_audit;
CREATE TRIGGER document_audit_no_change
  BEFORE UPDATE OR DELETE ON document_audit
  FOR EACH ROW EXECUTE FUNCTION document_audit_block();

DROP TRIGGER IF EXISTS document_audit_no_truncate ON document_audit;
CREATE TRIGGER document_audit_no_truncate
  BEFORE TRUNCATE ON document_audit
  FOR EACH STATEMENT EXECUTE FUNCTION document_audit_block();
