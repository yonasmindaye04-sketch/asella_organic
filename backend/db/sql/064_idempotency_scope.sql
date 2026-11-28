-- ===================================================================
-- 064_idempotency_scope.sql
-- Asella Organic — Scope idempotency keys to a caller (ASE-2026-006)
--
-- 1. Purge the cached responses. Every row in idempotency_keys is a stored
--    response body, and nine of the rows currently held the response of
--    POST /api/auth/login — complete with access and refresh tokens. The
--    table has a 24 hour TTL but nothing purged it, so those bodies had
--    been sitting there for days. The rows are a replayable session for
--    whoever logged in.
--
-- 2. Add scope_key. idempotency_keys.user_id was always NULL, because the
--    middleware runs ahead of the routers and req.user is not populated yet
--    when it runs. The key namespace was therefore global, and because
--    user_id is nullable inside the (user_id, idem_key) unique key — and
--    MySQL never treats NULLs as equal in a unique index — every anonymous
--    request with a repeated key inserted yet another row and the lookup
--    returned an arbitrary one of them.
--
--    scope_key carries the caller the key belongs to: the staff id for an
--    authenticated caller, a salted hash of the caller's phone number for
--    an anonymous one. The unique key moves from (user_id, idem_key) to
--    (scope_key, idem_key).
--
-- Historical orders are NOT touched: orders.total and order_items.unit_price
-- keep the values they were created with. This migration only rewrites the
-- idempotency cache, which is a cache.
-- ===================================================================

-- 1. Drop the cached response bodies, including the cached auth tokens.
DELETE FROM idempotency_keys;

-- 2. Add the caller scope.
ALTER TABLE idempotency_keys
    ADD COLUMN IF NOT EXISTS scope_key VARCHAR(80) NOT NULL DEFAULT '' AFTER user_id;

-- 3. Replace the global unique key with a per-caller one.
ALTER TABLE idempotency_keys
    DROP INDEX uq_user_key;

ALTER TABLE idempotency_keys
    ADD UNIQUE KEY uq_scope_key (scope_key, idem_key);

-- 4. Record migration in log
INSERT IGNORE INTO migrations_log (filename) VALUES ('064_idempotency_scope.sql');
