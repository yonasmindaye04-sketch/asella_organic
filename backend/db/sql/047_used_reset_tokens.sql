-- ── Used Password Reset Tokens (F-11) ─────────────────────────────────
-- Persists used reset tokens across processes and restarts to prevent replay.
CREATE TABLE IF NOT EXISTS used_reset_tokens (
    token_hash VARCHAR(64) PRIMARY KEY,
    user_id    VARCHAR(36) NOT NULL,
    used_at    DATETIME    DEFAULT CURRENT_TIMESTAMP NOT NULL,
    expires_at DATETIME    NOT NULL,
    INDEX idx_used_reset_tokens_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
