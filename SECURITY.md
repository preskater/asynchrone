# Security Policy

## Supported Versions

Asynchrone Space is under active development. Security fixes are applied to the latest
code on `main` and to the most recent tagged release.

| Version | Supported |
| --- | --- |
| `main` (latest) | :white_check_mark: |
| Latest `v*` release | :white_check_mark: |
| Older releases | :x: |

## Reporting a Vulnerability

Please **do not** report security vulnerabilities through public GitHub issues,
discussions, or pull requests.

Instead, report them privately using GitHub's
[Report a vulnerability](https://github.com/preskater/asynchrone/security/advisories/new)
flow. If you are unable to use that form, email the maintainers at
**security@asynchrone.space**.

Please include as much of the following as possible:

- A description of the vulnerability and its impact.
- Steps to reproduce (proof of concept, request/response, or screenshots).
- Affected version, commit SHA, or deployment.
- Any suggested remediation.

## What to Expect

- We will acknowledge your report within **3 business days**.
- We will provide an initial assessment and, where possible, a remediation
  timeline.
- We will keep you informed as the issue is investigated and fixed, and we are
  happy to credit you in the advisory unless you prefer to remain anonymous.

Please give us a reasonable amount of time to address the issue before any
public disclosure.

## Other contacts

| Topic | Contact | Response |
| --- | --- | --- |
| Vulnerability reports | **security@asynchrone.space** | Acknowledged within 3 business days |
| Privacy, access, export and deletion requests | **privacy@asynchrone.space** | Answered within 30 days |
| Signed DPAs and security questionnaires | **privacy@asynchrone.space** | Countersigned within 5 business days |

Both mailboxes are monitored by the maintainers. Prefer the private advisory form
above for anything that must stay confidential on GitHub.

## Legal and security documents

What procurement and security reviewers ask for is published, so a questionnaire
rarely needs to start from scratch:

- Data processing agreement (controller/processor, sub-processing, breach
  notification, deletion on termination, audit rights):
  [asynchrone.space/legal/dpa](https://asynchrone.space/legal/dpa)
- Sub-processors, with purpose, location and transfer mechanism:
  [asynchrone.space/legal/subprocessors](https://asynchrone.space/legal/subprocessors)
- Security overview, including what is **not** shipped yet:
  [asynchrone.space/legal/security](https://asynchrone.space/legal/security)
- Privacy policy and retention schedule:
  [asynchrone.space/legal/privacy](https://asynchrone.space/legal/privacy)

Printable PDFs live in `apps/landing/public/downloads/legal` and are regenerated
with `npm run legal:pdfs --workspace=landing`.
