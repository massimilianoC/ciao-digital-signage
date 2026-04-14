# Security Architecture & Tenant Isolation

> **Status**: 🟡 IN-PROGRESS (core patterns documented, deployment not yet validated)  
> **Implementation%**: 85% (design complete, production validation pending)  
> **Last Updated**: 2026-03-18  

---

## Executive Summary

Ciao enforces **strict tenant isolation** across:

- **Database layer**: Every collection mandatory `orgId` query filter + indexes
- **API layer**: Session orgId validation on all routes
- **Frontend layer**: Token scoping + org-context enforcement
- **Webapp isolation**: iFrame sandbox + capability token restriction

All third-party secrets (OAuth keys, API keys, S3 creds) are **server-side only** — never transmitted to frontend.

---

## Database Isolation

### Core Principle: Mandatory orgId Filter

Every database query in handlers MUST include `orgId` from session:

```typescript
// ✅ CORRECT
db.playlists.find({ orgId: session.org.id, _id: playlistId })

// ❌ WRONG (can leak data across tenants)
db.playlists.find({ _id: playlistId })
```

### Collections & Isolation Index

| Collection | Schema Field | Index | Validation |
|------------|--------------|-------|-----------|
| `users` | `orgId` (array) | Compound: `orgId, email` | Must be member of org |
| `organizations` | N/A (root document) | Primary | Isolated by `_id` only |
| `members` | `orgId` | Compound: `orgId, userId, role` | Enforced via org.members |
| `screens` | `orgId` | Compound: `orgId, groupId` | Enforced via org.screens |
| `groups` | `orgId` | Compound: `orgId, name` | Enforced via org.groups |
| `content` | `orgId` | Compound: `orgId, contentType` | Enforced via org.content |
| `playlists` | `orgId` | Compound: `orgId, name` | Enforced via org.playlists |
| `schedules` | `orgId` | Compound: `orgId, screenId` | Enforced via org.schedules |
| `contentTypes` | `orgId` | Compound: `orgId, name` | Enforced via org.contentTypes |

### Tenant Context Propagation

```typescript
// middleware.ts: Extract from NextAuth session
export async function middleware(req: NextRequest) {
  const session = await getSession({ req })
  if (!session?.org?.id) {
    return redirect('/login') // Enforce auth
  }
  // Attach to request context for handlers
  (req as any).orgId = session.org.id
}
```

**Handler Access Pattern**:

```typescript
// app/api/playlists/route.ts
export async function GET(req: NextRequest) {
  const session = await getSession({ req })
  const orgId = session?.org?.id
  if (!orgId) return Response { status: 401 }

  // Always filter by orgId
  const playlists = await db.playlists.find({ orgId })
  return Response.json(playlists)
}
```

---

## API Authentication & Sessions

### Session Format (NextAuth)

```typescript
// User session structure
{
  user: {
    id: string              // user._id
    email: string
    name: string
  },
  org: {
    id: string              // organization._id
    name: string
    role: 'admin' | 'member' | 'viewer'  // user.role in this org
  },
  expires: ISO8601
}
```

**Session Validation**:

- Issued on login (local or OAuth)
- Scoped to single organization (one session per org for a user)
- Cannot be forged (signed by NextAuth secret)
- Expired after 30 days or browser close (configurable)

### API Route Protection Checklist

```typescript
// Every /api/* route MUST follow this pattern:
export async function GET(req: NextRequest) {
  // 1. Get session
  const session = await getSession({ req })
  if (!session?.org?.id) {
    return new Response('Unauthorized', { status: 401 })
  }

  // 2. Validate orgId
  const orgId = session.org.id
  
  // 3. **Always** filter by orgId in data access
  const data = await db.collection.find({ orgId, ...otherFilters })
  
  // 4. Return
  return Response.json(data)
}
```

---

## Socket.IO Namespace Auth (Implemented)

| Namespace | Auth Mechanism | Status |
|-----------|---------------|--------|
| `/player` | `screenToken` + `screenId` + browser cookie `ciao_player_session` with DB lock (`activePlayerSessionId`) | ✅ Implemented |
| `/admin` | `orgId` presence required; full session validation **TODO** (see known gap below) | ⚠️ Partial |
| `/activation` | `screenId` presence required | ✅ Implemented |
| `/webapp` | `appId` + `instanceId` + `token` validated against `getQueuePublicStateForAccess()` | ✅ Implemented |

**Known gap — `/admin` namespace**: The admin namespace currently requires only `orgId` in the handshake,
relying on the fact that CMS pages are auth-gated by Next.js middleware. Full session/cookie validation
via NextAuth/better-auth is a pending hardening item (`server.ts` TODO comment).

### Player Monitor Exclusive Session Lock

Player runtime now enforces a monitor-level exclusive browser session:

- First browser calling `POST /api/player/session/claim` with valid `screenId + token` obtains lock.
- Server issues HttpOnly cookie `ciao_player_session` (`SameSite=Strict`, `Secure` in production).
- Socket `/player` handshake requires both token and cookie and validates DB lock ownership.
- If the same player URL is opened from another browser while monitor is active, connection is denied with `SESSION_LOCKED`.
- Public player endpoints (`/api/player/layout`, `/api/player/device-info`) also require the same cookie lock.

Per-screen control is supported by `screens.allowMultiSession`:

- `false` (default): exclusive single session per monitor.
- `true`: concurrent sessions allowed for that monitor.

Lock freshness:

- Lock heartbeat timestamp is `activePlayerSessionLastSeenAt`.
- Stale lock timeout is configurable via `PLAYER_SESSION_LOCK_TTL_MS` (default `45000`).

---

## Webapp Security

### Threat Model

**Webapp runs in iFrame (sandbox), can access**:

- HTTP API (proxied through player backend)
- Config (from CMS, scoped to instance)
- Socket.IO `/webapp` namespace (scoped to instance/channel keys)

**Webapp CANNOT access**:

- Third-party credentials (never provided to frontend)
- Other organizations' data (API proxied + filtered)
- Player runtime internals (restricted via sandbox)
- Browser local storage (iFrame isolated)

### Webapps as Untrusted Code

Webapps are treated as **untrusted vendor code** within privileged runtime:

1. **Sandbox Isolation**:

   ```html
   <!-- Player embeds webapp -->
   <iframe
     src="https://webapp.example/calendar"
     sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
     style="width: 100%; height: 100%"
   />
   ```

   - Can execute scripts, make API calls, render forms
   - **Cannot** access parent window, localStorage, or top-level cookies

2. **Capability Token** (API access control):

   In the current implementation, the capability token is the instance's `publicToken` —
   a `randomUUID()` stored in `webapp_instances.publicToken` at creation time.
   The server validates the token against the DB (not a stateless JWT) in the `/webapp`
   Socket.IO auth middleware and in public API routes.

   ```typescript
   // webapp.handlers.ts (Socket.IO auth)
   const snapshot = await getQueuePublicStateForAccess(instanceId, token);
   if (!snapshot) next(new Error("INVALID_TOKEN"));
   ```

   This provides:
   - Per-instance scoping (token is unique per `webapp_instance`);
   - Server-side revocation (change `publicToken` in DB to invalidate all sessions);
   - No JWT secret distribution required for player-side auth.

3. **API Request Flow**:

   ```
   Webapp Browser
     → Player Backend API
     → (orgId extracted from token)
     → Database (auto-filtered by orgId)
     → Response (tenant-safe data)
   ```

### Webapp Config Schema Constraints

Every webapp config is **strictly typed** to prevent injection:

```typescript
// Example: Google Calendar config schema
{
  "mode": {           // Enum field (dropdown)
    "type": "enum",
    "options": ["public-ics", "api-key"]
  },
  "calendar_id": {    // String field (validated)
    "type": "string",
    "pattern": "^[a-z0-9.@]+@groups\\.calendar\\.google\\.com$"
  },
  "timezone": {       // String enum (strict)
    "type": "enum",
    "options": [UTC timezone list]
  }
}
```

- No direct code or SQL injection possible (all fields typed)
- No credential fields in config (OAuth keys stored server-side only)
- Values validated on save + display

---

## Third-Party Credentials Management

### Rule: **Server-Side Only**

All credentials (API keys, OAuth tokens, S3 creds) are:

1. **Stored server-side** (encrypted in database or vault)
2. **Never exposed to frontend** (no API key in JavaScript)
3. **Accessed via proxy endpoints** (backend makes external calls)
4. **Scoped to organization** (separate keys per org if needed)

### Pattern: Backend Proxy

```typescript
// BAD: Direct API call from frontend (exposes key in network tab)
fetch('https://api.google.com/events?key=OAUTH_TOKEN')

// GOOD: Proxy through player backend
// Frontend
fetch('/api/webapps/google-calendar/events')

// Backend (app/api/webapps/google-calendar/events.ts)
export async function GET(req: NextRequest) {
  const session = await getSession({ req })
  const orgId = session?.org?.id
  if (!orgId) return new Response('Unauthorized', { status: 401 })

  // Retrieve secret (encrypted in DB or vault)
  const instance = await db.webapp_instances.findOne({
    orgId, type: 'google-calendar', instanceId: req.query.instanceId
  })

  // Use secret to call external API
  const googleResponse = await fetch('https://www.googleapis.com/calendar/v3/calendars/...',
    {
      headers: { Authorization: `Bearer ${instance.secrets.oauth_token}` }
    }
  )

  // Return filtered response (only public fields)
  return Response.json({
    events: googleResponse.events.map(e => ({ 
      id: e.id, 
      title: e.summary, 
      start: e.start.dateTime 
    }))
  })
}
```

### Secret Encryption

Secrets are stored encrypted in `webapp_secrets_refs`:

```typescript
// Collection schema
webapp_secrets_refs: {
  _id: ObjectId,
  orgId: string,                    // Mandatory
  instanceId: string,
  secretType: 'oauth_token' | 'api_key' | 's3_creds',
  encryptedValue: Buffer,           // AES-256-GCM encrypted
  encryptionKeyId: string,          // For key rotation
  createdAt: Date,
  expiresAt?: Date                  // Optional expiry
}
```

**Encryption Handling**:

```typescript
// On save
const encrypted = crypto
  .createCipheriv('aes-256-gcm', masterKey, iv)
  .update(secretValue, 'utf8', 'hex')
  .final('hex')

// On retrieve
const decrypted = crypto
  .createDecipheriv('aes-256-gcm', masterKey, iv)
  .update(encryptedValue, 'hex', 'utf8')
  .final('utf8')
```

---

## API Authorization

### Role-Based Access Control (RBAC)

| Role | Auth | Content | Playlists | Schedules | Screens | Admin |
|------|------|---------|-----------|-----------|---------|-------|
| **admin** | RW | RW | RW | RW | RW | ✅ |
| **member** | RO | RW | RW | RW | RW | ❌ |
| **viewer** | RO | RO | RO | RO | RO | ❌ |

**Route Protection Example**:

```typescript
// CMS route: Only allow admin in org
export async function DELETE(req: NextRequest, { params }) {
  const session = await getSession({ req })
  if (session?.org?.role !== 'admin') {
    return new Response('Forbidden', { status: 403 })
  }
  
  // Delete from org context
  await db.screens.deleteOne({
    _id: params.screenId,
    orgId: session.org.id
  })
  
  return new Response('OK')
}
```

### API Throttling (Per-Org)

⏳ **Planned (Q2)**:

- Rate limit: 100 req/min per org (burst: 1000 req/10s)
- Endpoint-specific: `/api/webapps/*` limit to 50 req/min
- Escalation: Alert admins at 80%, block at 100%

---

## Network Security

### CORS Policy

**Allowed Origins** (configurable per deployment):

```typescript
// Production
const corsOrigins = [
  'https://ciao.example.com',  // CMS
  'https://player.example.com' // Player
]

// Development
const corsOrigins = [
  'http://localhost:3100',  // dev server (server.js)
  'http://localhost:3001'
]
```

**Blocked**:

- Credentials in CORS headers (no `withCredentials` for cross-origin)
- Wildcard origins (`*`)
- Third-party domains

### HTTPS Enforcement

- All external APIs require HTTPS
- Self-signed certs allowed in development (NODE_TLS_REJECT_UNAUTHORIZED=0)
- Production: Valid certs from Let's Encrypt or CA

---

## Audit & Logging

### Events to Log

| Event | Trigger | Sensitive | Retention |
|-------|---------|-----------|-----------|
| User login/logout | Auth success/failure | No | 90 days |
| Org member add/remove | Admin action | No | 1 year |
| Credential create/rotate | Secret management | Yes* | 1 year |
| API access (webapps) | Per request | No** | 30 days |
| Content delete | Destructive action | No | 1 year |
| Permission change | RBAC update | No | 1 year |
| Data export | Admin action | Yes* | 1 year |

*Sensitive: Don't log the actual secret value, only that action occurred
**Normalize: Log endpoint + method, not request body

### Log Structure

```json
{
  "timestamp": "2026-03-17T14:23:00Z",
  "orgId": "org_123",
  "userId": "user_456",
  "action": "screen.delete",
  "resourceId": "screen_789",
  "result": "success|failure",
  "details": { "screenName": "Lobby Display" },
  "clientIp": "203.0.113.42",
  "userAgent": "Chrome/120"
}
```

**Storage**: MongoDB audit collection (indexed by `orgId, timestamp`)

---

## Deployment Security Checklist

### Pre-Production

- [ ] NextAuth secret is strong (256-bit random)
- [ ] MongoDB credentials rotated
- [ ] S3 bucket policy restricts to player IAM role
- [ ] CORS origins are explicit (not wildcard)
- [ ] Third-party API keys are in environment vars (not code)
- [ ] SSL/TLS certificates are valid and auto-renew
- [ ] Rate limiting is enabled on API routes
- [ ] Logging is configured and centralized
- [ ] Database backups are automated + tested
- [ ] Admin users have 2FA enabled
- [ ] Webapp instances have token expiry set
- [ ] Secrets encryption key is backed up + recoverable

### Post-Deployment Monitoring

- [ ] AccessLog for unauthorized requests (401/403 spikes)
- [ ] Alert on secret creation/rotation (unexpected)
- [ ] Monitor API threshold violations (rate limit breaches)
- [ ] Weekly: Check for new user registrations (anomalies)
- [ ] Monthly: Audit org access logs for suspicious patterns

---

## Known Gaps & Future Work

| Gap | Risk | Priority | Timeline |
|-----|------|----------|----------|
| API rate limiting not implemented | L | MEDIUM | Q2 |
| Audit logging not yet parsed/searchable | L | LOW | Q3 |
| Webapp credential rotation (manual) | L | LOW | Q3 |
| CORS hardening (specific origins) | M | MEDIUM | Q2 |
| 2FA for admin users (optional) | L | LOW | Q3 |
| IP allowlist per org (optional) | L | LOW | Q4 |

---

## Multi-Provider Security Architecture (Phase 8+)

Questa sezione definisce i requisiti minimi per integrare provider multipli (LLM, media generation, messaging, translation) senza violare isolamento tenant e segretezza credenziali.

### Security invariants (non negoziabili)

1. Nessun secret in frontend, iframe, URL o payload non cifrato.
2. Ogni chiamata provider passa da backend gateway con contesto `orgId`.
3. Ogni accesso secret produce audit event non repudiabile.
4. Ogni azione ad alto impatto richiede policy check e conferma esplicita.
5. Ogni provider e' isolato da policy capability-based per tenant.

### Secret Lifecycle Standard

Stati minimi secret:

- `created`
- `active`
- `rotating`
- `revoked`
- `expired`

Transizioni richieste:

1. **Create**: secret associato a org, provider, scope e rotation policy.
2. **Rotate**: doppia validita' temporanea per evitare downtime.
3. **Revoke**: invalidazione immediata + kill-switch per adapter correlati.
4. **Expire**: blocco accesso + alert amministrativo.

### Key Management Model

Schema raccomandato:

1. **KEK** (Key Encryption Key) in KMS/Vault.
2. **DEK per organizzazione** derivata e cifrata con KEK.
3. Secret provider cifrati con DEK org-specific.

Pattern aggiuntivo per derivazioni interne:

- `salt` per org (unico per tenant).
- `pepper` globale piattaforma custodito in KMS.

Questo riduce il rischio di compromissione trasversale tra tenant.

### Capability-Based Sandboxing

Ogni connector/webapp/automation agent riceve capability minime esplicite, ad esempio:

- `content.read`
- `content.create`
- `playlist.update`
- `schedule.propose`
- `schedule.apply`
- `screen.override`
- `provider.llm.chat`
- `provider.media.generate`

Regole operative:

1. Default deny su tutte le capability.
2. Scope per org + appId + instanceId.
3. TTL breve per token operativi.
4. Revoca runtime immediata (kill-switch).

### Provider Gateway Hardening Checklist

Ogni adapter provider deve implementare:

1. Signature validation per webhook ingress.
2. Timeout client obbligatorio.
3. Retry bounded con exponential backoff.
4. Circuit breaker + health score provider.
5. Rate limit per tenant e per provider.
6. Payload sanitization e output schema validation.

### Cifratura Dati Applicativi Sensibili (MongoDB)

Oltre alla cifratura storage-level, e' raccomandata cifratura field-level per:

- `webapp_secrets_refs.secretKey` o equivalente.
- credenziali oauth refresh token.
- endpoint privati tenant-specific.
- eventuali prompt sensibili salvati.

### Audit Trail Minimo per Compliance

Eventi da tracciare obbligatoriamente:

1. Secret create/rotate/revoke/read.
2. Provider call started/completed/failed.
3. Comandi AI accettati/bloccati/confermati.
4. Azioni publish/schedule applicate e rollback.

Formato consigliato:

```json
{
  "eventId": "uuid",
  "orgId": "...",
  "actor": "user|connector|system",
  "action": "secret.rotate",
  "resource": "provider:openai",
  "result": "success|failure",
  "reason": "policy|manual|expiry",
  "ts": "ISO8601"
}
```

### Open Source / Standards references

- HashiCorp Vault (secret lifecycle e leasing)
- OpenTelemetry (security auditing traces)
- OWASP ASVS + OWASP API Security Top 10
- NIST SP 800-57 (key management guidance)

---

## References

- [NextAuth.js Security](https://next-auth.js.org/security)
- [MongoDB Security Checklist](https://docs.mongodb.com/manual/security/security-checklist/)
- [OWASP API Security](https://owasp.org/API-Security/)
- [Frontend Sandbox Patterns](https://web.dev/sandboxed-iframes/)

---

**Last Updated**: 2026-03-17  
**Next Review**: 2026-04-17 (quarterly security audit)  
**Owner**: Security Lead + Backend Team  
**Acknowledgments**: OWASP, NextAuth.js, MongoDB security docs
