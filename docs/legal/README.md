# Legal pack

What a paying customer, a procurement team or a security reviewer asks for. All
of it is public and versioned in this repository, so the answer to a
questionnaire is a link rather than an email thread.

| Document | Route | PDF |
| --- | --- | --- |
| Privacy policy, with the retention schedule | `/legal/privacy` | `privacy-{en,fr}.pdf` |
| Terms of service | `/legal/terms` | `terms-{en,fr}.pdf` |
| Security overview, including what is not shipped | `/legal/security` | `security-{en,fr}.pdf` |
| Cookie statement | `/legal/cookies` | `cookies-{en,fr}.pdf` |
| Data processing agreement (template to sign) | `/legal/dpa` | `dpa-{en,fr}.pdf` |
| Sub-processor list | `/legal/subprocessors` | `subprocessors-{en,fr}.pdf` |

PDFs are served from `apps/landing/public/downloads/legal` and linked from every
legal page and from the contact page's legal pack. The path avoids
`/legal/*.pdf` on purpose: a file in `public` takes precedence over the
`/legal/[slug]` route, so a dotted name there would shadow a document.

## Where the content lives

- **Structure** — `apps/landing/lib/landing/legal.ts` lists the sections and blocks
  of each document (`p`, `list`, `table`, `pre`). A missing block renders
  nothing, so keep it in step with the copy.
- **Copy** — `packages/i18n/messages/en/legal.json` and `fr/legal.json`, keyed by the
  identifiers in that structure. English is type-checked through
  `Messages = typeof en`; French is not, which is why the check below exists.
- **Page chrome** — `apps/landing/components/landing/legal-page.tsx`.
- **Discovery** — the footer legal column in `apps/landing/lib/landing/content.ts`,
  the contact page pack, and `.github/ISSUE_TEMPLATE/config.yml`.

## Changing a document

1. Edit the section list in `lib/landing/legal.ts` if the layout changes.
2. Write the copy in **both** locales. Bump `updated` in both.
3. Run `npm run verify:legal-copy --workspace=landing`.
4. Regenerate the PDFs: `npm run legal:pdfs --workspace=landing` (needs Chromium;
   `npx playwright install chromium` once).
5. Commit the copy, the structure and the regenerated PDFs together — a PDF
   that disagrees with the page is worse than no PDF.
6. If the change touches retention, sub-processors or a security claim, update
   `retention-schedule.md` and check it against the code.

## Things that must stay true

- **Sub-processor list.** Add a provider the day it starts receiving customer
  data — not later. Today: OVHcloud (hosting and PostgreSQL), Resend, OpenAI,
  GitHub, GitLab, Stripe and Cloudflare Turnstile, the last four only when the
  corresponding feature is enabled.
- **24-hour breach notification** in the DPA and security page. That is a
  commitment someone has to be able to meet at 3am; the runbook is the
  operator's responsibility.
- **No consent banner** until a non-essential cookie exists. The cookie
  statement enumerates every cookie the product sets; if a new cookie appears,
  the statement and the banner requirement change together.
- **Contacts.** `privacy@asynchrone.space` and `security@asynchrone.space` are
  quoted in the privacy policy, the DPA, `SECURITY.md` and the issue-template
  config. Both mailboxes must be monitored — the published response times are
  30 days for data requests and 3 business days for security reports.

## Review checklist before publishing a change

- [ ] English and French say the same thing, dates included.
- [ ] Every claim is either shipped or listed under “What is not available yet”.
- [ ] Nothing names a provider, region or certification we do not actually use.
- [ ] PDFs regenerated and committed.
- [ ] `verify:legal-copy`, `lint`, `typecheck` and `build` pass.
