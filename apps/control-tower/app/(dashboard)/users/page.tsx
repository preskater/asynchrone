import Link from "next/link"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { PageHeader } from "@/components/page-header"
import { Pagination } from "@/components/pagination"
import { formatDate, formatNumber, formatRelative } from "@/lib/platform/format"
import {
  PAGE_SIZE,
  readPage,
  readString,
  type SearchParams,
} from "@/lib/platform/params"
import { parsePlatformRoles } from "@/lib/platform/roles"
import { requirePlatformContext } from "@/lib/platform/guard"
import { identityAdmin } from "@/lib/platform/identity"

export const metadata = { title: "Users" }

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await requirePlatformContext()

  const params = await searchParams
  const query = readString(params, "q").trim()
  const page = readPage(params)

  const result = await identityAdmin().listUsers({
    query: query || undefined,
    offset: (page - 1) * PAGE_SIZE,
    limit: PAGE_SIZE,
  })

  const users = result.items
  const pageCount = Math.max(1, Math.ceil(result.total / PAGE_SIZE))

  return (
    <div className="space-y-5">
      <PageHeader
        title="Users"
        description={`${formatNumber(result.total)} account${result.total === 1 ? "" : "s"} across every organization.`}
      />

      <form method="get" className="flex flex-wrap items-center gap-2">
        <Input
          name="q"
          defaultValue={query}
          placeholder="Search name or email…"
          className="max-w-xs"
        />
        <Button type="submit" variant="outline">
          Search
        </Button>
        {query ? (
          <Button
            variant="ghost"
            nativeButton={false}
            render={<Link href="/users" />}
          >
            Clear
          </Button>
        ) : null}
      </form>

      <div className="overflow-hidden rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Platform role</TableHead>
              <TableHead>Verified</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-end">Organizations</TableHead>
              <TableHead className="text-end">Last activity</TableHead>
              <TableHead className="text-end">Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground">
                  No user matches this search.
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => {
                const platformRoles = parsePlatformRoles(user.role)
                const lastActivity =
                  user.lastSessionAt ?? user.lastSeenAt ?? null

                return (
                  <TableRow key={user.id}>
                    <TableCell>
                      <Link
                        href={`/users/${user.id}`}
                        className="flex flex-col hover:underline"
                      >
                        <span className="font-medium">{user.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {user.email}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      {platformRoles.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {platformRoles.map((role) => (
                            <Badge key={role} variant="secondary">
                              {role.replace("platform_", "")}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={user.emailVerified ? "outline" : "secondary"}
                      >
                        {user.emailVerified ? "verified" : "pending"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {user.banned ? (
                        <Badge variant="destructive">banned</Badge>
                      ) : (
                        <span className="text-muted-foreground">active</span>
                      )}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      {formatNumber(user.organizationCount)}
                    </TableCell>
                    <TableCell className="text-end text-muted-foreground">
                      {formatRelative(lastActivity)}
                    </TableCell>
                    <TableCell className="text-end text-muted-foreground">
                      {formatDate(user.createdAt)}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Pagination
        basePath="/users"
        page={page}
        pageCount={pageCount}
        query={query ? { q: query } : {}}
        total={result.total}
      />
    </div>
  )
}
