# pi-devkit Toolkit Analysis & Improvement Plan

## Goal

Analyze the pi-devkit toolkit for quality gaps, fix critical issues, and propose new features that would improve developer experience and reliability.

---

## Tier 1: Fixes & Gaps

### 1. Validate `package.json` `pi` paths exist
**Problem:** Validation scripts never verify that paths declared in `package.json`'s `pi` key actually exist or contain valid resources. A typo silently breaks `pi install`.

**Changes:**
- `scripts/validate-pi-manifest.ts` — new script that reads `package.json`'s `pi` key, verifies each path exists and is non-empty.
- `test/validation/pi-manifest.test.ts` — new test file.
- Update `package.json` scripts and `validate` command.

**Status:** ✅ Done — `1b56e6c`

---

### 2. Relax skill description min length
**Problem:** `scripts/validate-skills.ts` enforces a 40-char minimum on descriptions, which is arbitrary — well-written 38-char descriptions fail.

**Changes:**
- `scripts/validate-skills.ts` — lower threshold to 20 chars.

**Status:** ✅ Done — `1b56e6c`

---

### 3. Add extension structure validation
**Problem:** No script verifies that each extension directory has a valid `index.ts` with the correct export signature.

**Changes:**
- `scripts/validate-extensions.ts` — new script. Checks each extension dir has `index.ts`, it exports a default function accepting `ExtensionAPI`.
- `test/validation/extension-validation.test.ts` — new test file.
- Update validation pipeline.

**Status:** ✅ Done — `1b56e6c`

---

### 4. Test dangerous-command edge cases
**Problem:** `test/validation/dangerous-command.test.ts` lacks realistic edge cases.

**Changes:**
- `test/validation/dangerous-command.test.ts` — add tests for: nested quotes, multi-command chains, extra whitespace, case-insensitive matches, escaped characters.

**Status:** ✅ Done — added 10+ edge-case tests.

---

### 5. Auto-generate `docs/catalog.md`
**Problem:** Catalog is manually maintained. Easy to forget updating when adding resources.

**Changes:**
- `scripts/generate-catalog.ts` — new script. Reads `package.json` `pi` key, walks resource dirs, reads frontmatter/index.ts, generates markdown tables.
- CI adds a diff check so stale catalog fails.
- `npm run generate:catalog` for manual regeneration.

**Status:** ✅ Done — `1b56e6c`

---

## Tier 2: Important Improvements

### 6. Add `pi-devkit` CLI for scaffolding
**Problem:** Every new resource requires manual directory/file creation — the #1 friction point.

**Changes:**
- `bin/pi-devkit.ts` — CLI entry point with subcommands: `init`, `validate`, `generate:catalog`, `publish`
- `init` scaffolds a new pi-devkit project with package.json, tsconfig, CI workflow, and sample resources
- `validate` runs the full validation pipeline
- `generate:catalog` regenerates docs/catalog.md

**Status:** ⏳ Pending

---

### 7. Validate `package.json` `files` list
**Problem:** Missing files in the `files` array cause silent omission on `npm publish`.

**Changes:**
- `scripts/validate-files.ts` — new script. Verifies every listed file exists.
- Add to validation pipeline.

**Status:** ✅ Done — `1b56e6c`

---

### 8. E2E smoke test for `pi install`
**Problem:** No test verifies the package actually installs and loads in a real Pi instance.

**Changes:**
- `test/e2e/install-smoke.test.ts` — new test. Gate behind `PI_E2E=1` (CI won't run it).
- Creates temp dir, runs `pi install ./`, verifies extensions load.

**Status:** ⏳ Pending

---

## Tier 3: Nice-to-Have (Future)

### 9. Prompt argument-hint consistency check
Validate that every prompt's `argument-hint` format is used and `$ARGUMENTS` references match.

**Status:** ⏳ Pending

---

### 10. Theme export validation
Validate `export.pageBg`, `export.cardBg`, `export.infoBg` use valid color values.

**Status:** ⏳ Pending

---

### 11. Skill trigger keyword extraction
Auto-extract "Use when" triggers from SKILL.md files and index for search.

**Status:** ⏳ Pending

---

### 12. Bundle size check for extensions
Measure each extension's file size, flag anything over a threshold (e.g., 50KB).

**Status:** ⏳ Pending

---

### 13. Security audit script
Build-time scan for: hardcoded secrets, `eval()`/`new Function()` in extensions, outdated deps with CVEs.

**Status:** ⏳ Pending

---

### 14. Changelog CLI helper
`pi-devkit changelog <type> <message>` — creates changeset or appends to CHANGELOG.md.

**Status:** ⏳ Pending

---

## Files to Change

| Action | File | Description |
|---|---|---|
| New | `scripts/validate-pi-manifest.ts` | Validate pi paths exist |
| New | `scripts/validate-extensions.ts` | Validate extension structure |
| New | `scripts/generate-catalog.ts` | Auto-generate catalog |
| New | `scripts/validate-files.ts` | Validate package.json files list |
| New | `test/validation/pi-manifest.test.ts` | Tests for pi manifest validation |
| New | `test/validation/extension-validation.test.ts` | Tests for extension validator |
| New | `test/e2e/install-smoke.test.ts` | E2E smoke test (gated) |
| Changed | `scripts/validate-skills.ts` | Relax description min length |
| Changed | `test/validation/dangerous-command.test.ts` | Add edge case tests |
| Changed | `package.json` | Add new scripts, new files entry |
| Changed | `docs/catalog.md` | Regenerated by new script |
| Changed | `.github/workflows/ci.yml` | Add new validation steps |

## Acceptance Criteria

1. ✅ All 4 existing validation scripts + new ones pass in CI.
2. ✅ Every `pi` path in `package.json` is verified to exist and be non-empty.
3. ✅ Every extension directory is verified to have a valid `index.ts`.
4. ✅ `docs/catalog.md` can be regenerated and matches current state.
5. ✅ `dangerous-command` tests cover at least 10 edge cases beyond current ones.
6. ✅ `npm run check` still passes with all changes.
7. ⏳ `pi-devkit` CLI scaffolds new resources with one command.
8. ⏳ E2E smoke test verifies `pi install` works end-to-end.

## Implementation Summary

| Tier | Items | Done | Pending |
|---|---|---|---|
| Tier 1 | 1-5 | 5/5 | 0 |
| Tier 2 | 6-8 | 1/3 | 2 |
| Tier 3 | 9-14 | 0/6 | 6 |
| **Total** | **14** | **6/14** | **8** |
