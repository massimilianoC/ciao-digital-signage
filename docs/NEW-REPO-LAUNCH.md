# Lancio nuovo repo pubblico: `ciao-digital-signage`

Questa guida descrive come creare il repo pubblico `ciao-digital-signage` su GitHub
a partire dalla codebase privata corrente (`disi-web`), **senza portare la cronologia
storica** (log interni, runbook operativi, dati di test).

---

## Pre-requisiti

- Git installato con accesso a `origin` (repo privato `disi-web`)
- GitHub CLI (`gh`) oppure accesso web a GitHub
- Node.js per verificare la build prima del push
- Tutti i file sensibili rimossi o esclusi (vedi `docs/PUBLIC-RELEASE-CHECKLIST.md`)

---

## Step 1 — Verifica che non ci siano segreti nel working tree

```bash
# Cerca pattern comuni di credenziali nel codice sorgente
git grep -nE "(sk_|pk_|MONGODB_URI|PASSWORD|SECRET|APIKey|api_key)" -- \
  "*.ts" "*.tsx" "*.js" "*.mjs" "*.env*"
```

I file `.env*` devono essere gitignored. Controlla `.gitignore` e gli esempi.

---

## Step 2 — Crea un branch orfano (nessuna cronologia storica)

```bash
# Dalla root del repo disi-web, branch master o main corrente
git checkout --orphan public-release

# Rimuovi tutto dallo stage (i file rimangono sul disco)
git rm -rf --cached .
```

---

## Step 3 — Escludi file interni prima del commit iniziale

I file seguenti **non devono essere inclusi** nel repo pubblico:

```bash
# Rimuovi runbook operativo (contiene IP, path macchina)
Remove-Item -Force docs/DEPLOY-PRODUCTION.md 2>$null; true

# Rimuovi piano attività interno
Remove-Item -Force PIANO-ATTIVITA.md 2>$null; true

# Rimuovi cartella .planning/ se esistente
Remove-Item -Recurse -Force .planning 2>$null; true

# Rimuovi file di utenti/password di test (anche se gitignored, per sicurezza)
Remove-Item -Force TEST-USERS.env.example 2>$null; true
```

> Attenzione: usa `Remove-Item` su PowerShell Windows o `rm -f` su bash/Git Bash.

---

## Step 4 — Stage e commit iniziale pulito

```bash
git add -A

git commit -m "feat: initial public release — Ciao Digital Signage v0.1-alpha

Snapshot from private development history.
Clean branch without operational runbooks or internal planning.

Public repo: https://github.com/massimilianoC/ciao-digital-signage"
```

---

## Step 5 — Crea il repo pubblico su GitHub

### Con GitHub CLI

```bash
gh repo create massimilianoC/ciao-digital-signage \
  --public \
  --description "Open-source digital signage platform. Manage screens, playlists and schedules from a single web interface." \
  --homepage "https://github.com/massimilianoC/ciao-digital-signage"
```

### Via web

1. Vai su <https://github.com/new>
2. Nome repository: `ciao-digital-signage`
3. Visibilità: **Public**
4. **Non** inizializzare con README (aggiungeremo il branch orfano)

---

## Step 6 — Aggiungi remote e pusha

```bash
git remote add public https://github.com/massimilianoC/ciao-digital-signage.git

git push public public-release:main
```

---

## Step 7 — Configura il repo pubblico

Dopo il push:

1. Imposta `main` come default branch nelle impostazioni GitHub
2. Abilita **Issues** e **Discussions** se vuoi community feedback
3. Aggiungi i topic: `digital-signage`, `nextjs`, `typescript`, `cms`, `open-source`
4. Collega la licenza (già presente: `LICENSE`)
5. Verifica che `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md` siano visibili

---

## Step 8 — Depreca il repo privato

Nel repo privato `disi-web`:

1. Archivia o rinomina in `disi-web-archive`
2. Aggiungi al README privato:

```markdown
> **Deprecato** — La codebase pubblica è ora su
> [ciao-digital-signage](https://github.com/massimilianoC/ciao-digital-signage).
> Questo repo è storicizzato e non riceve più aggiornamenti.
```

---

## Checklist finale

- [ ] `git grep` non trova segreti nel branch `public-release`
- [ ] `docs/DEPLOY-PRODUCTION.md` assente dal commit
- [ ] `TEST-USERS.env.example` assente o sanitizzato
- [ ] Build Next.js passa senza errori TypeScript (`npx tsc --noEmit`)
- [ ] Repo creato su GitHub come **Public**
- [ ] Branch `main` impostato come default
- [ ] Topic e descrizione aggiunti
- [ ] Repo privato `disi-web` archiviato/aggiornato con nota di deprecazione

---

## Note sulla cronologia

Il commit iniziale conterrà un'unica "snapshot" squash-free. Questo è intenzionale:
la cronologia privata contiene IP interni, note operative e dati di seed non adatti
a un repo pubblico. Futura cronologia partirà da questo commit pulito.
