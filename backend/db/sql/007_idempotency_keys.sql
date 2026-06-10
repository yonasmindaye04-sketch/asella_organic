-- Migration 007: idempotency_keys
-- Stores client-supplied Idempotency-Key header values for safe POST
-- retry. The middleware in src/middleware/idempotency.ts reads/writes
-- this table to dedupe duplicate requests.
--
-- 007_idempotency_keys.sql
CREATE TABLE IF NOT EXISTS idempotency_keys (
    id              CHAR(36)        PRIMARY KEY DEFAULT (UUID()),
    idem_key        VARCHAR(128)    NOT NULL,
    user_id         CHAR(36)        NULL,
    method          VARCHAR(10)     NOT NULL,
    path            VARCHAR(255)    NOT NULL,
    request_hash    CHAR(64)       NOT NULL,
    status          SMALLINT        NULL,
    response_body   JSON            NULL,
    response_headers JSON           NULL,
    created_at      DATETIME        DEFAULT CURRENT_TIMESTAMP,
    expires_at      DATETIME        NOT NULL,
    UNIQUE KEY uq_user_key (user_id, idem_key),
    KEY idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
