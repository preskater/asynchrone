# 0040. Record client test feedback per release in the clients database

- Status: accepted
- Date: 2026-11-12
- Deciders: Asynchrone Space maintainers
- Issue: #132

## Context

Client test feedback (UAT) arrives as emails, spreadsheets and chat messages.
Nobody can answer what a client reported on a given version, which reports are
still open, or what changed between two test rounds. The CRM core (ADR 0012)
models companies, contacts, deals, activities and documents, but nothing
versioned: there is no release entity anywhere in the schema. The in-app
feedback form files support tickets in the identity database (ADR 0039); it is
about the product itself, not about what an agency delivers to its clients.

Since ADR 0032 and #171, CRM data lives in the clients database and the clients
app may not read another app's database. Tasks live in the projects database,
files in the files database, and the client portal is served by Copilot.

## Considered options

1. **Reuse `ClientActivity`** with a `feedback` type and a version string. No
   release entity, no per-release status or report, no structured filters.
2. **Track feedback as project tasks** with a label per version. Ties feedback
   to a project, mixes client reports with internal work, and the clients app
   would have to read the projects database.
3. **Two new models in the clients database**, `ClientRelease` and
   `ClientFeedback`, owned by `@workspace/clients`, with cross-database
   references stored as plain ids.

## Decision

Option 3.

- `ClientRelease` is a delivery version of one company: `version` (unique per
  company), optional `label`, `releasedAt`, `status`
  (`planned | in_test | approved | rejected`), `notes`, an optional `projectId`
  and a `portalVisible` flag. The test date range shown on a release is derived
  from its feedback, not stored.
- `ClientFeedback` is one report on one release: who reported it (`contactId`,
  same database, so a real relation), who recorded it (`authorId`), who owns it
  (`assigneeId`), `testedAt` (date and time), `environment`, `category`,
  `impact`, `status` (`new | triaged | accepted | rejected | fixed | deferred`)
  with `statusChangedAt`, `title`, `body`, and a `version` snapshot so a renamed
  release does not rewrite history.
- `projectId`, `linkedTaskId`, `documentId`, `authorId` and `assigneeId` point
  to other databases and are plain ids without foreign keys (ADR 0032). The
  clients app resolves them through the internal APIs.
- Categories and impacts reuse the in-app form vocabulary, moved to
  `@workspace/core/feedback` so Copilot and the clients app share one
  taxonomy without an app-to-app import.
- Access follows the CRM rules in `@workspace/clients` (`viewer` reads, `member`
  and above write, `admin` and above delete a release or a report). Every
  mutation writes one audit row on the company (`client.release.*`,
  `client.feedback.*`), so status changes are timestamped and show, translated,
  on the company timeline without a user-editable `ClientActivity` note.
- "Convert to task" calls the projects delegated internal API with an
  idempotency key and stores the returned task id; the projects app never reads
  the clients database.
- The release report is a print view (browser "Save as PDF") plus a CSV export
  through `@workspace/core/csv`. A server-side PDF renderer is not added: the
  legal PDFs are generated at build time with Chromium, which is not available
  at request time.
- The portal (Copilot) reads a release report only through a clients delegated
  operation, and only for releases with `portalVisible` set and owned by the
  portal user's company, mirroring the read-only project visibility policy.

## Consequences

- One query answers "what did this client report on 1.4.2"; regressions are
  visible per version.
- Dangling ids are possible when a task or file is deleted in another app; the
  UI treats an unresolved id as "no longer available" instead of failing.
- Organization export and deletion must include both tables in the clients
  app's saga endpoints.
- Wiring the in-app form to `ClientFeedback`, bug-tracker sync and test-case
  management stay out of scope (#132).
