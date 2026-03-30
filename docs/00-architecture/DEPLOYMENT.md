# Ciao Deployment Guide

> **Status**: 📋 IN PLANNING  
> **Implementation**: 0% (skeleton only)  
> **Last Updated**: 2026-03-17  
> **Target Environment**: Vercel (Next.js) + Railway (MongoDB)

## Overview

Ciao is a **full-stack Next.js application** with:

- Next.js App Router (API routes + SSR pages)
- MongoDB database
- Socket.IO real-time server
- File uploads to local `/public/` or cloud storage (S3/GCS)

---

## Development Environment

### Prerequisites

```bash
Node.js 18+ (v18.17 or v20+)
npm 9+
MongoDB 5.0+ (local or Atlas)
```

### Setup

```bash
# Clone repo
git clone https://github.com/massimilianoC/ciao-web.git
cd ciao-web

# Install dependencies
npm install

# Copy env template
cp .env.example .env.local

# Edit .env.local with your secrets
# - MONGODB_URI=mongodb+srv://...
# - NEXTAUTH_SECRET=<random>
# - NEXTAUTH_URL=http://localhost:3100

# Init database (seed test users)
npm run seed:users

# Start dev server
npm run mvp:start  # or npm run dev  # port 3100

# Open http://localhost:3100
```

---

## Staging Environment (Planned)

- **Host**: Railway, Vercel, or self-hosted VPS
- **Database**: MongoDB Atlas (cloud)
- **Files**: S3 or local NFS mount
- **Secrets**: Environment variables via platform secrets manager

**Setup steps** (placeholder):

```bash
# 1. Create MongoDB Atlas cluster
# 2. Create Railway/Vercel project
# 3. Set environment variables
# 4. Deploy via git push
# 5. Run migrations if any
```

---

## Production Environment (Planned)

- **Host**: Vercel (recommended, native Next.js) or Railway
- **Database**: MongoDB Atlas (auto backups)
- **Files**: S3 with CloudFront CDN (for thumbnails/uploads)
- **Auth**: NextAuth.js with HTTPS
- **Monitoring**: Sentry (errors), DataDog or similar (APM)
- **Backups**: Automated MongoDB backups + daily exports to S3

**Deployment checklist** (template):

```markdown
- [ ] Environment variables set (API keys, secrets, database URI)
- [ ] Database backup strategy in place
- [ ] SMTP configured for emails
- [ ] File storage (S3 or equivalent) ready
- [ ] Domain DNS configured
- [ ] SSL certificate installed
- [ ] Monitoring/alerting configured
- [ ] Smoke tests pass
- [ ] Playbook for rollback documented
```

---

## Environment Variables

See `.env.example` for full list.

### Critical (Required)

```bash
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/ciao?retryWrites=true
NEXTAUTH_SECRET=<long-random-string>
NEXTAUTH_URL=https://ciao.example.com
NEXTAUTH_URL_INTERNAL=http://localhost:3100  # for server-side calls
```

### Optional (Defaults applied)

```bash
NODE_ENV=production
LOG_LEVEL=info
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=noreply@example.com
SMTP_PASS=<password>
```

---

## Database Migrations

Currently: None required (first deployment).

If adding database schema changes:

1. Write migration script in `scripts/migrations/`
2. Test on local copy of production data
3. Run before application update
4. Document in CHANGELOG.md

---

## File Uploads Strategy

### Development

Local `/public/uploads/` and `/public/thumbnails/`.

### Production (Recommended)

S3 with IAM role. Update configuration in `lib/upload.ts`.

```typescript
// Example
import AWS from "aws-sdk";
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_KEY,
});
```

---

## Monitoring & Observability

### Recommended Stack

| Tool | Use | Status |
|------|-----|--------|
| **Sentry** | Error tracking | Not yet integrated |
| **DataDog** | APM + Logs | Not yet integrated |
| **Vercel Analytics** | Page speed | Built-in (if Vercel) |
| **MongoDB Atlas Monitoring** | DB health | Built-in (if Atlas) |

### Health Check Endpoint

```
GET /api/health
```

Returns:

```json
{
  "status": "healthy",
  "timestamp": "2026-03-17T10:00:00Z",
  "services": {
    "database": "ok",
    "socket": "ok"
  }
}
```

Use in load balancer health checks.

---

## Scaling Considerations

### Database

- **Sharding**: Not needed for < 10M docs. Scale vertically with MongoDB Atlas.
- **Connection pooling**: Mongoose handles via `MONGOOSE_POOL_SIZE` if needed.

### Files

- **Static files**: Use CDN (Cloudfront, Vercel Edge) for `/public/`.
- **Uploads**: Move to S3 + CloudFront as volume grows.

### Real-Time (Socket.IO)

- **Single instance**: Sufficient for < 1K concurrent screens.
- **Scaling**: Use Socket.IO Redis adapter if > 1K screens.

---

## Disaster Recovery

### Backup Strategy

```bash
# Daily MongoDB backup to S3
mongodump --uri="..." --archive=s3://backups/ciao-$(date +%Y%m%d).archive

# Retention: 30 days
```

### Recovery Procedure

1. Restore from backup: `mongorestore --archive=<backup-file>`
2. Verify data integrity
3. Test on staging first
4. Deploy to production if OK
5. Document incident

---

## Rollback Plan

### Blue-Green Deployment

1. Deploy new version to separate environment
2. Run smoke test checklist
3. Switch load balancer to new environment
4. Keep old environment online for 1 hour
5. If issues, switch back immediately

---

## Security Checklist (Pre-Deploy)

- [ ] All secrets in environment variables (not in code)
- [ ] NextAuth.js secret set to strong random value
- [ ] Database password changed from default
- [ ] HTTPS enabled on all endpoints
- [ ] CORS configured to specific allowed origins
- [ ] API rate limiting enabled
- [ ] Logging configured (no sensitive data logged)
- [ ] Database backups automated
- [ ] Monitoring alerts configured

---

## Cost Estimation (Monthly, Small Org)

| Service | Cost | Notes |
|---------|------|-------|
| **Vercel** | $20 | Pro plan, ~100 GB data transfer |
| **MongoDB Atlas** | $57 | M10 shared cluster, 512 MB storage |
| **S3** (files) | $5-20 | ~100 GB stored, access costs |
| **Sentry** | $0 | Free tier 5K events/month |
| **Domain** | $12/yr | .com domain |
| **Total** | **~$100-120/mo** | 1-5 orgs, 10-50 screens |

---

## References

- **Vercel Deployment**: <https://vercel.com/docs/frameworks/nextjs>
- **Railway Guide**: <https://railway.app/docs>
- **MongoDB Atlas**: <https://docs.atlas.mongodb.com/>
- **NextAuth.js**: <https://next-auth.js.org/deployment>
- **Socket.IO Deployment**: <https://socket.io/docs/v4/socket-io-adapter/>

---

**Status**: 📋 Planned for Q2 2026  
**Owner**: DevOps / Infrastructure team (TBD)  
**Next review**: When staging environment is ready
