# Safetybiz One — development status

Updated 27 Nov 2026. Live: https://safetybizone.netlify.app/ · Repo: safetybizone/safetybizone (main) · Supabase: golucvydrewisoclwstq

## Architecture
- Tests (local):
  - database: `test_011.sql` (63 checks), `test_012.sql` (16 checks, rolled back)
  - browser: `e2e_r2.py` (22 checks), `e2e_certdel.py` (9), `e2e_struct.py`, `e2e_ch.py`, `e2e_perm.py`; all re-runnable
  - test-copy-only clean-up: `cleanup_dup_units.sql`
- Static ES-module app, no build step, hosted on Netlify from GitHub `main`.
  - `core.js`: Supabase client, shared UI helpers, data cache `D`
  - `main.js`: routing by role
  - `admin.js`: Safetybiz admins and company admins (builder)
  - `portal.js`: managers and staff
  - `compliance.js`: Compliance centre and food hygiene
  - `services.js`: service jobs and certificates, forms in `FORMS`
  - `pdf.js`: PDFs
  - `photos.js`: photos
- Supabase Postgres with row-level security on every table. The browser is never trusted.
  - Helper functions: `is_admin`, `is_super`, `is_client_admin`, `my_client_id`, `mgr_client`, `mgr_site`, `mgr_unit`, `my_sectors`, `company_has_admin`
- Edge functions:
  - `fsa`: food hygiene ratings
  - `companies-house`: key held in the secret `CH_API_KEY`, admin only
- Roles:
  - superadmin
  - Safetybiz admin
  - company admin (`client_admin`)
  - regional/area manager (`manager`)
  - staff
  - Rules follow the Permission master sheet (https://claude.ai/artifact/4bUoEvqfccqAhBCVnQzBKj).
- Local test copy:
  - stack in `/home/claude/localtest`: Postgres :5433, PostgREST :3000, proxy :8787
  - start it with `up.sh`; rebuild the database with `reset.sh`
  - e2e scripts: `e2e_*.py`

## Database changes (migrations, all applied live)
| No. | Adds |
| --- | --- |
| 002 | Hazard sections, approval |
| 003 | Compliance centre: doc types, site documents, file store |
| 004 | Superadmins, company admins building their own RAs |
| 005 | Food hygiene rating and history |
| 006 | Brand → Region → Area (`org_units`), managers, brand masters |
| 007 | Service jobs and certificates |
| 008 | Photos on RA controls and actions |
| 009 | Sectors, people permissions |
| 010 | Companies House fields on `clients` |
| 011 | Releases 1+2 (live 27 Nov): `legal_entities`; `org_units_unique_name`; `guard_site_delete`; `assessments.brand_id` + `mgr_ra()`; site fields (`trading_name`, `legal_entity_id`, `business_activity`, `contact_email`, `status`, `archived_at`, `region_id`); **`site_brands`** (several brands per site); `site_doc_types` + `compliance_doc_types.default_applies`; head office trigger removed; org-wide masters; `guard_master`. `sites.unit_id` is no longer used by the app (it mirrors `region_id`). Data step: `data-011-head-offices.sql` |
| 012 | Certificate delete (live 27 Nov): `admin_log`; `delete_certificate(kind, id, reason)` (superadmin only); issued certificates are deletable only through it; uploaded certificates can no longer be deleted directly by admins |

## Completed (latest first)
- 27 Nov: **Releases 1 and 2 and the certificate delete deployed live.**
  - Before: local tests passed (`test_011` 63/63, `test_012` 16/16, `e2e_r2` 22/22, `e2e_certdel` 9/9, structure, CH and permission e2e). Backup schema `backup_20261127` taken; rollback rehearsed.
  - Deployed: migrations 011 and 012; data step (Crawley kept with all its records, head office flag removed; nothing deleted); `companies-house` function v2; app files. Commits 2e9cc6f, da296a8, 87ccf61, a50cf58, cd045fa (`admin.js`), each checked byte-for-byte against GitHub (`admin.js` differs only in two literal non-breaking spaces in place of ` `, the same string at runtime).
  - Live checks (run in transactions that were rolled back, as real users):
    - Existing records: counts in all 16 tables identical to the backup (1 organisation, 6 sites, 7 certificates incl. 2 N/A, 3 service jobs, 4 units, 6 food hygiene records).
    - Site creation: legal entity, site with region (`unit_id` mirrors it), 9 default certificate types, archive sets `archived_at`.
    - Multiple brands: a site with 2 brands; a duplicate brand name is refused.
    - Certificate N/A: recorded as before; existing N/A records intact.
    - Crawley can't be deleted (archive only).
    - Company admin: sees its own sites and certificates (6 + 1 test site, 7 + 1 test N/A); can't create a master; can't delete a certificate.
    - Managers: GDK brand → its 4 sites + shared test site; second brand → only the shared site; North → Manchester + test site; South → Exeter. GDK-specific RA on shared site: seen by GDK and North managers, not by the second brand or South; the premises RA is seen by all covering managers.
    - Companies House: function live; no sign-in → 401; signed out (anon key) → refused. A real search needs a signed-in admin in the app.
    - Security advisor: no new errors (only the existing warnings on helper functions and leaked-password protection).
- 27 Nov: **superadmin certificate delete** (migration 012, local, goes with Releases 1 and 2).
  - "Delete certificate" on an issued service certificate; "Delete" on an uploaded certificate in the Compliance centre.
  - A reason is required. Deleting a service certificate also removes its filed copy and the defects it raised.
  - Every deletion is written to `admin_log`, which only superadmins can read and nobody can edit.
  - Safetybiz admins, company admins and managers can't delete; superadmins can't bypass the log by direct API delete.
  - Withdrawing a certificate (keep it but mark it void) is proposed for later, not built.
- 27 Nov: pre-deployment fixes (in migration 011, local only):
  - unique brand, region and area names (existing duplicates renamed "Name (2)" when migrating; there are none live), and unique default names in the UI
  - a site with records can't be deleted (it previously cascaded away its certificates and service records)
  - `assessments.brand_id` plus `mgr_ra()`, so brand-specific RAs on shared premises follow the brand
  - the storage rule for RA photos follows the same rule
  - duplicate test units merged on the test copy
- 27 Nov: **Release 2 built and tested locally, not deployed** (Releases 1 and 2 go live together).
  - Organisations:
    - list renamed "Organisations"
    - onboarding has a Companies House search or a "not registered" entity type, optional sites and a required company admin; no head office is created
    - correspondence address is not a site
  - Organisation page:
    - details
    - sites list (archived hidden behind a toggle)
    - **Legal entities** panel: add from Companies House or by hand, refresh, edit, remove when unused
    - Brands and regions panel: two independent columns, folded away until used
    - sectors, people, RAs
  - **Site page** (`#/site/<id>`, `#/site/new/<org>`):
    - tiles for certificates and actions
    - details form that saves on Save: name, trading name, address, legal entity (or add a new one), activity, site manager, email, phone, status, brands (any number), region (optional)
    - linked RAs read-only and food hygiene
    - linked from the Compliance centre site profile
  - Archived sites are left out of lists, pickers, dashboard totals, the Compliance centre and the manager's sites; their records stay readable.
  - Masters:
    - Safetybiz can create organisation-wide or brand masters.
    - Company admins can't pick a master in Create and see masters read-only ("Master (managed by Safetybiz)" + "Sites using it"); they can still copy a master to their sites and update their copies.
  - Staff invite needs a site ("All sites" must be chosen explicitly).
  - Companies House details are saved on the legal entity, never on the organisation.
- 27 Nov: one site can trade as **several brands** (`site_brands`). Brand managers see every site carrying their brand, and brand masters copy to every site carrying the brand.
- 27 Nov: Release 1 built and tested locally, **not deployed** (single `brand_id` replaced by `site_brands` above).
  - Data model:
    - Legal entities belong to one organisation and can be reused across its sites. A database foreign key stops a site using another organisation's entity.
    - Company numbers are unique within an organisation.
    - Brand and region are independent, optional fields on each site; regions no longer sit under brands, and an area sits under a region.
    - Managers see sites by brand or by region, with areas included.
  - Certificates: which certificate types apply is set per site (`site_doc_types`). New sites get the default 9; gas, lift, kitchen extraction and grease trap are off by default.
  - Head office: no longer created automatically.
  - Masters: can be organisation-wide (`unit_id` null) or brand-specific, and only Safetybiz can create or change them (trigger `guard_master`).
  - Companies House:
    - details move to a legal entity and directors are cleared
    - the function lets company admins look up companies too, and no longer fetches directors (code changed, not deployed)
  - Current screens: `sites.unit_id` stays in step through the `check_site_unit` trigger, so the existing screens keep working. `admin.js` now offers "+ Area" under regions only.
- 27 Nov: Companies House lookup at onboarding and on the company page (migration 010, `companies-house` function).
- 27 Nov: permissions per master sheet; sector-filtered topic library.
- 27 Nov: RA navigation, photos on controls and actions, percentage score removed.
- Earlier: service certificates, brand masters, structure, food hygiene, compliance centre, RA builder, sign-offs.

## Key design decisions
- Certificates and PDFs carry the Safetybiz logo; all form wording is our own (no NICEIC or BSI copyright text).
- No percentage score on RAs.
- Food safety work is parked.
- Show before pushing: build and test locally, send screenshots, then wait for "push it". Never push `config.js`.
- Review decisions of 27 Nov (doc: https://claude.ai/artifact/HFcMzw2EYpQBm3P32EiVb6):
  - Head office sites: stop creating them automatically; delete the two existing ones (all current data is test data).
  - Company administrator stays required at onboarding.
  - Stop storing directors and clear the ones saved.
  - Masters are organisation-wide or brand-specific. Only Safetybiz creates or changes them; organisations copy them to sites and adjust their own copies.
  - Only Safetybiz creates templates (topics, masters, service templates). Organisations start from approved templates.
  - Brand and region are optional and independent, and a site can carry several brands. Names are unique per organisation (areas: unique per region).
  - A site with compliance records is archived, never deleted (enforced by the database). Only a site with no records can be deleted.
  - Shared premises: everyone who covers a site sees its premises records (site, certificates, service records, site defects, premises-wide RAs). A brand's own RAs (copies of its brand master) and their actions, sign-offs and photos are seen by that brand's managers and by the site's region or area managers, not by another brand's managers.
  - The certificate list and N/A behaviour are unchanged; applicability per site (`site_doc_types`) is stored but not yet used by the screens (Release 3).
  - RAs and service jobs start from approved templates in the Compliance centre (e.g. Extinguishers → Commissioning).

## Planned
- Rollback for Releases 1+2 if ever needed: `rollback-011.sql`, then re-apply 006 to 009, then redeploy the previous app files (rehearsed). Keep `backup_20261127` until Release 3 is live.
1. **Release 3 (not started, awaiting approval):** RA register, approved templates (RA and service), compliance status from applicable types.

## Outstanding issues
- Default certificate list still to be confirmed (used only in Release 3; the current certificate list and N/A are unchanged).
- `clients` still has the old Companies House columns (now unused); drop them in a later clean-up.
- Companies House: do one real search in the app as an admin (add a legal entity) to confirm the full lookup.
- Netlify could not be checked from here; hard-refresh the app to load the new files.
- Possible later option: withdraw a certificate (keep it, mark it void) instead of deleting.
- Default applicable certificate list not yet confirmed (proposal in the review doc).
- Owner side:
  - make the repo private
  - set up SMTP and branded sign-in emails
  - Supabase Pro and a custom domain
  - current copies of BS 5266-1, BS 5839-1, BS 5306-3 and the IET Code of Practice
