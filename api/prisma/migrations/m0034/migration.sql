BEGIN;

CREATE TABLE authentication_throttles (
    id SERIAL PRIMARY KEY,
    bucket_key VARCHAR(64) NOT NULL UNIQUE,
    failure_times TIMESTAMPTZ(3)[] NOT NULL DEFAULT ARRAY[]::TIMESTAMPTZ(3)[],
    blocked_until TIMESTAMPTZ(3),
    created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ(3),
    CONSTRAINT authentication_throttles_bucket_key CHECK (bucket_key ~ '^[0-9a-f]{64}$'),
    CONSTRAINT authentication_throttles_failure_bound CHECK (cardinality(failure_times) <= 100)
);

COMMENT ON TABLE authentication_throttles IS 'Shared authentication failure windows; keys are purpose-separated HMACs, never raw identifiers or addresses.';

COMMIT;
