# Ciao Testing Strategy

> **Status**: ✅ COMPLETE (MVP coverage)  
> **Implementation**: 85%  
> **Last Updated**: 2026-03-17  
> **Coverage**: Core platform (Phases 1-7), Webapp SDK (partial)

## Test Pyramid

```
       /\
      /  \  E2E (Playwright) ← smoke tests, critical paths
     /────\
    /      \ Integration (API + DB)
   /────────\
  /          \ Unit (pure functions, mocks)
 /────────────\__________
```

### Unit Tests (Isolated)

| Test | File | Status | Coverage |
|------|------|--------|----------|
| **buildDisplayNumber** (Queue format) | `tests/services/queue-connector.service.test.ts` | ✅ PASS (5/5) | 100% |
| **parseIcsEvents** (Google Calendar) | `tests/services/google-calendar-connector.service.test.ts` | ✅ PASS (2/2) | 100% |
| **normalizeGoogleApiEvent** | same | ✅ PASS (1/1) | 100% |

**Total unit tests**: 8/8 pass ✅

### Integration Tests (API + Mocks)

Status: Manual testing via `npm run mvp:health` + Postman.

| Task | Verified | Evidence |
|------|----------|----------|
| Health endpoint | ✅ | Last checked 2026-03-16 |
| Auth flow (login/register) | ✅ | Works in manual testing |
| Seed test users | ✅ | `npm run seed:users` produces 3 test accounts |

### E2E Tests (End-to-End)

#### Critical Path (MUST PASS)

| Test File | Tests | Status | Evidence |
|-----------|-------|--------|----------|
| `e2e/pairing-player.spec.ts` | 3 | ✅ PASS | Screen pairing → Player connect → Render |
| `e2e/groups-scheduling.spec.ts` | 3 | ✅ PASS | Group create → Schedule → Sync |
| `e2e/media-player.spec.ts` | 2 | ✅ PASS | Content play → Transitions |

**Total critical**: 8/8 pass ✅

#### Extended Suite (Coverage, Non-Blocking)

| Test File | Tests | Status | Issue |
|-----------|-------|--------|-------|
| `e2e/api.spec.ts` | N/A | ⚠️ PARTIAL | Some session shape mismatches (fallback in place) |
| `e2e/auth.spec.ts` | N/A | ⚠️ PARTIAL | Legacy selectors, UI changed |
| `e2e/cms-*.spec.ts` | N/A | ⚠️ PARTIAL | Same (low priority, non-blocking) |

**Rationale**: Core critical paths are green. Legacy E2E skipped to focus on MVP.

### Test Execution

```bash
# Unit tests
npm run test -- tests/services/

# Type checking
npm run typecheck

# Critical E2E only (MVP)
npm run pipeline:mvp

# Full pipeline (includes legacy E2E)
npm run pipeline:full  # ⚠️ may fail on legacy, non-blocking
```

---

## Test Coverage by Phase

### Phase 1 (Auth + Multi-Tenancy)

- ✅ Login/register routes work
- ✅ Org isolation enforced (session context)
- ⚠️ No dedicated unit test (implicit in API tests)

### Phase 2 (Content + Screens)

- ✅ Content CRUD tested manually
- ✅ Screen pairing flow covered (E2E)
- ⚠️ No bulk content ops test

### Phase 3 (Scheduling)

- ✅ Schedule CRUD works (manual)
- ✅ Priority resolver tested (state machine tests)
- ✅ Priority resolution tested (E2E groups-scheduling)

### Phase 4 (Real-Time)

- ✅ Socket.IO manifest delivery tested (E2E)
- ✅ Player heartbeat verified (manual runtime)
- ⚠️ No disconnect/reconnect flow E2E test

### Phase 5 (Player)

- ✅ Content cycling tested (E2E media-player)
- ✅ Transitions render (E2E)
- ⚠️ Fullscreen edge cases not covered

### Phase 6 (CMS)

- ✅ Dashboard loads (manual)
- ✅ CRUD pages functional (manual)
- ⚠️ Some E2E selectors outdated

### Phase 7 (Frontend Specs)

- ✅ PDF/YouTube rendering tested (manual)
- ✅ Lifecycle FSM working (manual + state tests)
- ✅ Connectivity FSM verified (state logic tested)

### Phase 8+ (Webapp SDK)

- ✅ Queue buildDisplayNumber unit test (5/5)
- ✅ Google Calendar parser unit test (3/3)
- 🟡 **Webapp CMS catalog** — no E2E coverage yet (in-progress feature)
- 🟡 **Player webapp rendering** — no E2E coverage yet

---

## Test Debt (Tracked)

| Item | Priority | Note |
|------|----------|------|
| Disconnect/reconnect E2E | P2 | Socket lifecycle edge case |
| Bulk content ops | P2 | Drag-drop, multi-select |
| Webapp CMS catalog flow | P2 | New feature, manual only |
| Webapp player (Calendar) | P2 | New feature, manual only |
| Legacy E2E suite cleanup | P3 | Refactor/remove outdated tests |

---

## Manual Testing Checklist (QA)

Run before releases:

```markdown
### MVP Smoke Test (15 min)

- [ ] **Auth**: Register new org → Login → Verify email token
- [ ] **Content**: Upload image → Verify thumbnail → Delete → Verify gone
- [ ] **Screen**: Pair screen (qr code/code) → See populated in grid
- [ ] **Playlist**: Create empty → Add content → Verify order → Remove item
- [ ] **Schedule**: Create fixed (now → 2h) → See on screen → Force override → Clear
- [ ] **Player**: Open /activate → See QR → Pair from CMS → Player loads manifest
- [ ] **Runtime**: Disable content in playlist → Player auto-cycles to next
- [ ] **Override**: Force-play other content → Player obeys → Clear override
- [ ] **Connectivity**: Disconnect player network → See "offline" in grid → Reconnect → "online"

### Webapp Features (if testing new connectors)

- [ ] **Google Calendar**: CMS create instance → Player loads calendar → Test refresh
- [ ] **Queue**: CMS create display instance → Remote instance issue/advance → Display updates
```

---

## CI/CD Integration (Planned)

Currently: Manual `npm run pipeline:mvp` before deploy.

**Recommended** (not yet implemented):

```yaml
# .github/workflows/test.yml (skeleton)
name: Tests
on: [push, pull_request]
jobs:
  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm install
      - run: npm run typecheck
      - run: npm run test -- tests/
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm install
      - run: npm run pipeline:mvp
```

---

## Test Maintenance

- **Weekly**: Review test logs in PIANO-ATTIVITA
- **Monthly**: Update checklist with new features
- **Quarterly**: Audit E2E for flakiness, refactor brittle selectors

---

## References

- **Playwright config**: [playwright.config.ts](../../playwright.config.ts)
- **Test helpers**: [e2e/helpers.ts](../../e2e/helpers.ts)
- **Global setup**: [e2e/global-setup.ts](../../e2e/global-setup.ts)
- **Unit test examples**: [tests/services/](../../tests/services/)

---

**Last reviewed**: 2026-03-17  
**Next review**: 2026-04-14 (monthly)  
**Execution time**: MVP suite ~3 min, full suite ~8 min
