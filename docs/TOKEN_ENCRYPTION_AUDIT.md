# Token Encryption Audit

## Method

Every `CREATE TABLE` in `server/db/postgres/schema.sql` was reviewed for columns named `*token*`. For each hit, every `INSERT`/`UPDATE` statement writing to that column in `server/db.ts` was located and checked for encryption, and every corresponding row-mapper (read path) was checked for decryption. A repository-wide grep (`grep -rn "access_token\|refresh_token"`) confirms `server/db.ts` is the only file in the codebase that writes these columns — no other file constructs `INSERT`/`UPDATE` SQL against them, so there is no parallel unencrypted write path anywhere else. Additionally, the on-disk debug log written during the Meta OAuth flow (`storage/meta_oauth_debug.json`) was checked, since a token can be "stored" in a plaintext file just as easily as in a database column.

## Every Token Field Discovered

| # | Table.Column | File (schema) | Before this pass | After this pass | Risk (before) |
|---|---|---|---|---|---|
| 1 | `shopify_stores.access_token` | `server/db/postgres/schema.sql` | Plaintext | AES-256-GCM encrypted (paired with new `access_token_iv` column) | HIGH |
| 2 | `shopify_stores.refresh_token` | `server/db/postgres/schema.sql` | Plaintext | AES-256-GCM encrypted (paired with new `refresh_token_iv` column) | HIGH |
| 3 | `social_accounts.access_token` | `server/db/postgres/schema.sql` | Plaintext | AES-256-GCM encrypted (paired with new `access_token_iv` column) | HIGH |
| 4 | `social_accounts.refresh_token` | `server/db/postgres/schema.sql` | Plaintext | AES-256-GCM encrypted (paired with new `refresh_token_iv` column) | HIGH |
| 5 | `workspace_ai_providers.api_key_encrypted` | `server/db/postgres/schema.sql` | Already encrypted (paired `api_key_iv` column) — pre-existing from Phase 1 | Unchanged, re-verified still correct | N/A (already fixed) |
| 6 | `refresh_tokens.token` (JWT refresh tokens) | `server/db/postgres/schema.sql` | Not a third-party credential — a self-issued, short-lived, revocable JWT signed by this app. Storing it in cleartext with a `UNIQUE` constraint is standard practice (equivalent to a session ID); encrypting it would not add meaningful protection since the JWT itself is only useful in combination with `JWT_REFRESH_SECRET`, which is what's actually confidential. | Unchanged — not in scope, correctly assessed as not needing this treatment | LOW (by design) |
| 7 | `sessions.refresh_token_id` | schema.sql | A foreign-key-style reference (the `id` of a `refresh_tokens` row), not a credential itself | Unchanged — not a secret | N/A |
| 8 | `workspace_woocommerce_connections.consumer_key_encrypted` / `consumer_secret_encrypted` | schema.sql | Already encrypted (paired `_iv` columns) — pre-existing | Unchanged, re-verified still correct | N/A (already fixed) |

**Every genuinely sensitive third-party OAuth token field found in the schema (#1–#4) is now encrypted.** #5 and #8 were already correctly encrypted before this pass (found during review, not newly fixed — listed for completeness since the task asked for "every token field discovered"). #6–#7 were assessed and correctly excluded as not being third-party secrets.

## File Locations and Fix Detail

### `server/db/postgres/schema.sql` / `schemaSql.ts`
Added `access_token_iv` and `refresh_token_iv` columns to both `shopify_stores` and `social_accounts`, via both the `CREATE TABLE` definition (fresh installs) and `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (existing installs) so the migration is safe to run against a database that already has data.

### `server/db.ts`
- **New helpers**: `encryptTokenField()` / `decryptTokenField()` — thin wrappers around the existing `encrypt()`/`decrypt()` from `server/encryption.ts` (the same AES-256-GCM service already protecting AI provider keys). `decryptTokenField()` degrades gracefully (returns the value as-is) if no IV is present, so any pre-existing plaintext row from before this fix does not hard-crash on read — it simply reads back as before until the next write re-encrypts it.
- **`saveShopifyStore()`** — both the "store already exists → UPDATE" branch and the "new store → INSERT" branch now encrypt `accessToken`/`refreshToken` before the write.
- **`updateShopifyStore()`** — encrypts the effective token (`patch.accessToken ?? existing.accessToken`) before the write. This matters because `existing` comes from a decrypting read (`getShopifyStoreById` → `mapShopifyStoreRow`), so without re-encrypting here, a token-preserving update (one that doesn't change the token) would have written the *decrypted plaintext* value back into the encrypted column.
- **`mapShopifyStoreRow()`** — decrypts `access_token`/`refresh_token` using the row's `access_token_iv`/`refresh_token_iv` before returning a `ShopifyStoreConnection` to any caller.
- **`createSocialAccount()`** — encrypts `accessToken`/`refreshToken` before the `INSERT`.
- **`mapSocialAccountRow()`** — decrypts on read, same pattern as Shopify.

### `server.ts` (Meta OAuth flow — plaintext token found in a debug log, not a database column)
`currentLog.meAccountsResponse = pagesData;` was writing Meta's raw `/me/accounts` Graph API response — which includes a real, usable `access_token` per Facebook Page — verbatim into `storage/meta_oauth_debug.json` on every connection attempt. This is a plaintext-token-at-rest exposure independent of the database encryption fix above (a file on disk, not a DB column, but still "storage" in the sense the audit asked about). **Fixed**: each page's `access_token` is now replaced with the literal string `"MASKED_FOR_SECURITY"` before being written to the log, matching the pattern already used for the top-level user-token exchange response earlier in the same file (`currentLog.tokenExchangeResponse`).

## Verification That No Plaintext Token Write Path Remains

```
$ grep -n "access_token\b\|refresh_token\b\|access_token_iv\|refresh_token_iv" server/db.ts
```
Every line returned is one of: (a) an `encryptTokenField()`/`decryptTokenField()` call, (b) a parameter name (`$accessToken`, `$accessTokenIv`, etc.) bound to an already-encrypted value, or (c) part of the `CREATE TABLE`/mapper code shown above. There is no line assigning a raw, un-encrypted token string directly to `access_token`/`refresh_token` in any `INSERT`/`UPDATE` statement.

```
$ grep -rn "INSERT INTO shopify_stores\|INSERT INTO social_accounts\|UPDATE shopify_stores\|UPDATE social_accounts" server.ts server/**/*.ts
```
Returns matches only inside `server/db.ts`. No other file constructs SQL against these tables — `server/shopify/live-sync.ts` and `server.ts` call `db.saveShopifyStore()` / `db.updateShopifyStore()` / `db.createSocialAccount()`, never raw SQL.

## Live Runtime Verification (not just code inspection)

Both encryption paths were exercised against a real, running PostgreSQL database, with the ciphertext inspected directly via `psql` — not inferred from reading the code:

**Shopify** (via the real `/api/shopify/oauth/callback` HTTP route, sandbox mode):
```
 shop_domain               | status    | connection_mode | token_ciphertext_preview | has_iv
----------------------------+-----------+------------------+--------------------------+--------
 e2e-test-shop.myshopify.com | needs_reauth | sandbox       | sTi7xC6NzmtNR+Ab8DNv     | t
```
The stored value is base64 ciphertext, not the plaintext `shpat_sandbox_test_...` token that was returned in the API response at connection time.

**Social accounts** (via direct invocation of the real `DatabaseManager.createSocialAccount()` against Postgres — see TEST_RESULTS.md for why the HTTP-level OAuth path itself cannot be driven in this network-restricted environment):
```
Raw DB access_token (ciphertext): J3ei+R32hXQdz5KFLmADEox+zxlmGY...
Contains original plaintext token substring? false
Has IV stored? true
Decrypted value via getSocialAccounts() matches original plaintext? true
```

## Remaining Risk

- **Pre-existing rows from before this fix** (if any existed in a real deployment) would have `access_token_iv IS NULL` and would continue to be treated as plaintext by `decryptTokenField()`'s graceful-degradation path until the next write re-encrypts them. There is no automatic backfill/re-encryption migration for already-stored plaintext rows in this pass — for a fresh deployment (the only kind this cutover has actually been tested against), this does not apply. For an existing production database being upgraded, a one-time backfill script (read each row, encrypt, write back) would be a reasonable follow-up; it was not written here since no real pre-existing production data exists to migrate against.
- **`sessions`/`refresh_tokens`** were deliberately left as cleartext, matching standard session-token practice (see table row #6 above) — flagged here explicitly so it isn't mistaken for an oversight.
