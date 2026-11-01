# Use a chunked upload protocol with UploadSession

- Status: accepted
- Deciders: Asynchrone Space maintainers
- Date: 2026-10-10

## Context and Problem Statement

Files are stored as PostgreSQL large objects ([ADR-0005](0005-store-files-as-postgresql-large-objects.md)),
but serverless functions cap the request body size (Vercel: 4.5 MB). A file
larger than that cannot be uploaded in a single request. How should uploads be
split, validated, and made retry-safe without buffering whole files in memory?

## Decision Drivers

- Each request must stay comfortably under the 4.5 MB serverless body cap.
- Chunk boundaries should align with PostgreSQL large-object page size
  (`LOBLKSIZE`, 2048 bytes).
- Retries must be safe: duplicate, reordered, or gapped chunks must be rejected.
- Finalized uploads must be verified (size and checksum) before becoming files.
- Abandoned uploads must not leak large objects.

## Considered Options

- A chunked upload protocol backed by an `UploadSession` record.
- Direct-to-database single-request uploads.
- Presigned uploads to external object storage.

## Decision Outcome

Chosen option: "A chunked upload protocol backed by an `UploadSession` record",
because it fits the serverless body cap, is retry-safe, and verifies integrity
before finalizing.

`packages/files/src/upload-config.ts` sets `UPLOAD_CHUNK_SIZE` to 3 MiB (a multiple of
`LOBLKSIZE`) with a 1-hour session TTL and a 3-attempt in-memory chunk retry
budget. The flow is: `POST /api/files/uploads` (authz + quota, create large
object and session), `PUT /api/files/uploads/[uploadId]` (append one chunk; the
`x-chunk-offset` header must equal bytes already received),
`POST /api/files/uploads/[uploadId]/complete` (re-read bytes, validate size and
SHA-256, create `FileNode`/`FileVersion` or return the `oid` for a transient
attachment), and `DELETE` to abort. `GET /api/files/uploads/sweep` unlinks
sessions past their lease and also runs opportunistically on init.

### Positive Consequences

- Uploads of any size are supported while each request stays under the
  serverless limit.
- Offset checks make retries safe against duplicates, reordering, and gaps.
- Size and SHA-256 verification at completion prevent corrupt finalization.
- Expired sessions are swept so their large objects are not orphaned;
  the sweep also guards against unlinking objects a completed file references.

### Negative Consequences

- Chunking adds a multi-request client flow and session state to manage.
- Retries are in-memory within a session only; uploads do not resume across
  page reloads.
- Upload and download routes must hold a pooled connection for the transfer and
  set `maxDuration`, competing with Prisma traffic (see ADR-0005).
- A transient message-attachment path shares the same machinery, adding a special
  case to finalization.

## Pros and Cons of the Options

### Chunked upload protocol with UploadSession

- Good, because it respects the serverless body cap and is retry-safe.
- Good, because integrity is verified before a file is created.
- Bad, because it introduces session state and a multi-step client flow.

### Direct single-request uploads

- Good, because it is the simplest client and server implementation.
- Bad, because files larger than the body cap cannot be uploaded at all.

### Presigned uploads to object storage

- Good, because large files bypass the app server and can resume.
- Bad, because it reintroduces the external object store that
  [ADR-0005](0005-store-files-as-postgresql-large-objects.md) removed.

## Links

- `packages/files/src/upload-config.ts`
- `packages/files/src/upload-session.ts`
- `packages/files/src/upload-client.ts`
- `apps/web/app/api/files/uploads/**`
- `README.md` — "File storage"
- [ADR-0005](0005-store-files-as-postgresql-large-objects.md) — the storage layer
