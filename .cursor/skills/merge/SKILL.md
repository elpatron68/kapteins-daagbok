---
name: merge
description: >-
  Merge Git branches safely — fetch latest, merge or rebase onto master, resolve
  conflicts intelligently, and verify the result. Use when the user asks to merge
  branches, sync with master, resolve merge conflicts, or bring a feature branch
  up to date.
---

# Git Merge

Führe Branch-Merges sicher und nachvollziehbar aus. Für PR-Review, CI und
Comment-Triage siehe den **babysit**-Skill — dieser Skill deckt die Git-Merge-
Operation selbst ab.

## Projekt-Kontext

- **Basis-Branch:** `master` (nicht `main`)
- **Monorepo:** `client/` (React PWA) und `server/` (Express API) — Konflikte
  können in beiden liegen

## Sicherheitsregeln (immer einhalten)

- **Niemals** `git config` ändern
- **Niemals** `--no-verify`, `--no-gpg-sign` o.ä. ohne explizite Anfrage
- **Niemals** `push --force` auf `master` — bei Bedarf warnen und abbrechen
- **Niemals** destruktive Befehle (`reset --hard`, `clean -fd`) ohne explizite Anfrage
- **Niemals** interaktive Git-Befehle (`-i`-Flags) — nicht unterstützt
- **Kein Commit** ohne explizite Anfrage des Users
- **Kein Push** ohne explizite Anfrage des Users

## Workflow

### 1. Ausgangslage klären

Parallel ausführen:

```bash
git status
git branch -vv
git log --oneline -5
```

Ermittle:

- Aktueller Branch
- Ziel-Branch (Standard: `master`)
- Ob uncommittete Änderungen vorliegen
- Ob der Branch einen Remote-Tracking-Branch hat

**Bei uncommitteten Änderungen:** Stashen (`git stash push -m "pre-merge"`) nur
mit Zustimmung oder wenn der User es verlangt hat. Sonst stoppen und melden.

### 2. Merge-Strategie wählen

| Situation | Empfehlung |
|-----------|------------|
| Feature-Branch aktuell halten | `git merge origin/master` (Merge-Commit) |
| Linearer Verlauf gewünscht | `git rebase origin/master` (nur wenn User Rebase verlangt) |
| Zwei Feature-Branches zusammenführen | `git merge <branch>` auf Ziel-Branch |

**Standard:** Merge (nicht Rebase), es sei denn der User verlangt Rebase.

### 3. Remote aktualisieren

```bash
git fetch origin
```

Vor dem Merge prüfen, wie weit der Branch hinter `origin/master` liegt:

```bash
git log --oneline HEAD..origin/master
git log --oneline origin/master..HEAD
```

### 4. Merge ausführen

**Feature-Branch mit master synchronisieren** (häuigster Fall):

```bash
git checkout <feature-branch>
git merge origin/master
```

**Branch in master mergen** (nur wenn User das ausdrücklich will — normalerweise
passiert das via PR):

```bash
git checkout master
git pull origin master
git merge <feature-branch>
```

Merge-Commit-Nachricht kurz und sachlich halten, z.B.:
`Merge branch 'master' into feature/push-notifications-owner`

### 5. Konflikte lösen

Konfliktdateien finden:

```bash
git diff --name-only --diff-filter=U
```

**Pro Konfliktdatei:**

1. Datei lesen und beide Seiten verstehen (HEAD = eigener Branch, incoming = gemergter Branch)
2. Intent beider Änderungen erhalten — nicht blind eine Seite wählen
3. Konfliktmarker entfernen (`<<<<<<<`, `=======`, `>>>>>>>`)
4. Bei widersprüchlicher Intent: Merge abbrechen und User fragen

```bash
git merge --abort   # oder: git rebase --abort
```

**Typische Konflikt-Muster in diesem Projekt:**

| Bereich | Hinweis |
|---------|---------|
| `package-lock.json` | Nach manueller Lösung `npm install` im betroffenen Paket (`client/` oder `server/`) ausführen |
| i18n (`client/src/i18n/`) | Beide Sprachkeys (DE + EN) behalten, keine Keys verlieren |
| Prisma/Schema | Migrationen beider Seiten zusammenführen, nicht überschreiben |
| Verschlüsselung/Auth | Vorsichtig — keine Sicherheitslogik stillschweigend vereinfachen |

Nach jeder gelösten Datei:

```bash
git add <file>
```

Merge abschließen (nur wenn User Commit verlangt hat):

```bash
git commit -m "$(cat <<'EOF'
Merge branch 'master' into <feature-branch>

EOF
)"
```

### 6. Verifizieren

Nach erfolgreichem Merge:

```bash
git status
git log --oneline -5
```

Relevante Checks je nach betroffenen Bereichen:

```bash
# Client
cd client && npm run build

# Server
cd server && npm run build
```

Bei Lockfile-Konflikten oder Dependency-Änderungen: Build in beiden Paketen prüfen.

### 7. Abschluss

- Ergebnis dem User mitteilen: welche Branches, wie viele Konflikte, was gelöst wurde
- Bei `git stash`: erinnern, Stash wieder anzuwenden (`git stash pop`)
- Push nur auf explizite Anfrage: `git push origin <branch>`

## Wann abbrechen und fragen

- Widersprüchliche fachliche Intent (z.B. beide Seiten ändern dieselbe Logik unterschiedlich)
- Konflikte in Krypto-, Auth- oder Sync-Kernlogik ohne klares „richtig“
- Merge würde `.env`, Credentials oder Secrets einschließen
- User wollte nur Status prüfen, nicht tatsächlich mergen

## Abgrenzung zu anderen Skills

| Skill | Wann |
|-------|------|
| **merge** (dieser) | Git merge/rebase, Konflikte, Branch sync |
| **babysit** | PR merge-ready: Comments, CI, PR-Konflikte im PR-Kontext |
| **creating-pull-requests** | PR erstellen und pushen |
