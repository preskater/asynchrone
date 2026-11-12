# Organization roles

Roles add up: a member holding several roles gets everything each one grants.
Combining roles needs the Team or Enterprise plan; on Free, each member has one
role. Change roles in **Settings → Members** (owners and admins).

| Role      | Can do                                                                                      | Cannot do                                                    |
| --------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Owner     | Everything, including deleting or exporting the organization and audit retention.           | —                                                            |
| Admin     | Manage members, invitations, billing, appearance, integrations, settings and the audit log. | Delete or export the organization.                           |
| Member    | Work in projects, tasks, files, calendars, messages, CRM and HR (own records).              | Manage people, billing or settings.                          |
| Developer | Connect repositories, work on tasks and files.                                              | Edit projects, manage people, billing, appearance, settings. |
| Viewer    | Read the workspace.                                                                         | Change anything.                                             |
| Client    | Client-portal access to their company's projects and shared documents. Holds no other role. | Enter the workspace.                                         |

`member` + `developer` is the usual pairing for an engineer: everything a member
does, plus repository connections.

An organization always keeps at least one owner: the last owner cannot be
demoted or removed. The exact capability map lives in
`packages/core/src/roles.ts`; see ADR 0040.
