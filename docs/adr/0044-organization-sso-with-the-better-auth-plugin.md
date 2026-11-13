# 0044. Organization SSO with the Better Auth `sso` plugin

- Status: accepted
- Date: 2026-11-13
- Deciders: platform
- Issue: #93

## Context

The Enterprise plan and the security page advertise single sign-on, but no
SAML/OIDC configuration, domain verification or SSO-only sign-in existed. The
`sso` entitlement was already defined in `@workspace/core/plans`. SCIM
provisioning is part of the same issue and is delivered separately.

## Considered options

1. **Build SAML and OIDC ourselves.** Full control, but SAML signature and
   assertion validation is easy to get wrong and expensive to maintain.
2. **An external broker (WorkOS, Auth0).** Fast, but a new sub-processor, a new
   secret and identity data leaving our databases.
3. **Better Auth's `sso` plugin**, already on our auth stack, with the policy
   we need around it.

## Decision

Option 3. Better Auth moves to 1.7.22, the plugin's minimum.

- **One provider per organization.** `ssoProvider.organizationId` is unique;
  the provider id is `org-<organizationId>`, so callbacks are stable.
- **Management is server-only.** The plugin's `/sso/register`, `/update-provider`,
  `/delete-provider`, `/providers`, `/get-provider`, `/request-domain-verification`
  and `/verify-domain` answer 404 over HTTP; Copilot's server actions
  (`apps/copilot/lib/organization/sso.ts`) call them through `auth.api` after
  checking `organization:update` and the `sso` entitlement, and write the audit
  rows (`organization.sso.*`).
- **OIDC discovery is ours.** The plugin only discovers issuers listed in
  `trustedOrigins`, which must stay limited to our own apps. We discover the
  issuer with the plugin's `discoverOIDCConfig`, allowing only public HTTPS
  hosts (`isPublicHttpsUrl`), and register the endpoints with `skipDiscovery`.
- **Domains are proven with DNS.** A TXT record
  `_asynchrone-space-verification-<providerId>.<domain>` must hold the token
  before `/sign-in/sso` routes anyone to the provider.
- **Auto-join.** A verified domain's users join the organization as `member`
  on their first SSO sign-in. The plugin inserts the member directly, so its
  `getRole` callback checks the plan's seat limit and writes the audit row
  first.
- **SSO-only sign-in.** `organization.ssoEnforced` is checked in the
  `session.create.before` database hook, the one place every sign-in method
  ends: a user whose email is on an enforced, verified, still-entitled domain
  gets `SSO_REQUIRED` unless the session comes from an SSO callback or an
  impersonation handoff. Owners of that organization keep password + 2FA as
  break-glass, so a broken identity provider cannot lock everyone out.
- **Downgrades.** Losing the entitlement stops enforcement without rewriting
  the setting; admins can always turn it off and remove the provider.

## Consequences

- An admin can configure Okta, Entra ID, Google Workspace or any SAML/OIDC IdP
  from Settings → Members, prove the domain and require SSO.
- The OIDC client secret is stored in `ssoProvider.oidcConfig` as the plugin
  writes it, protected like the rest of the identity database (at-rest
  encryption, no secret in responses). Field-level encryption would need a
  plugin hook that does not exist yet.
- Discovery accepts only public HTTPS issuers; an internal IdP needs its
  endpoints allowlisted deliberately.
- SCIM provisioning, group mapping and IdP-initiated logout are not part of
  this record.
