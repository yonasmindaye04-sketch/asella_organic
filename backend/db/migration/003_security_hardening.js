/**
db/migrations/003_security.js
Asella Organic — Security Infrastructure (MySQL)
*/
const sql = `
-- ── Session Blocklist (JWT Revocation) ─────────────────────────────
CREATE TABLE IF NOT EXISTS session_blocklist (
    jti        VARCHAR(255) PRIMARY KEY,
    revoked_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    expires_at DATETIME NOT NULL
);
CREATE INDEX idx_session_blocklist_expires ON session_blocklist(expires_at);

-- ── Rate Limit Log ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rate_limit_log (
    id          CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    ip          VARCHAR(45) NOT NULL,
    endpoint    VARCHAR(255) NOT NULL,
    occurred_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_rate_limit_ip ON rate_limit_log(ip, occurred_at);
`;

module.exports = { sql };