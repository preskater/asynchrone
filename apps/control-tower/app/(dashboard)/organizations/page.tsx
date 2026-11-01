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
import { formatDate, formatNumber } from "@/lib/platform/format"
import {
  PAGE_SIZE,
  readPage,
  readString,
  type SearchParams,
} from "@/lib/platform/params"
import { requirePlatformContext } from "@/lib/platform/guard"
import { identityAdmin } from "@/lib/platform/identity"

export const metadata = { title: "Organizations" }

export default async function OrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await requirePlatformContext()

  const params = await searchParams
  const query = readString(params, "q").trim()
  const page = readPage(params)

  const result = await identityAdmin().listOrganizations({
    query: query || undefined,
    offset: (page - 1) * PAGE_SIZE,
    limit: PAGE_SIZE,
  })

  const organizations = result.items
  const pageCount = Math.max(1, Math.ceil(result.total / PAGE_SIZE))

  return (
    <div className="space-y-5">
      <PageHeader
        title="Organizations"
        description={`${formatNumber(result.total)} organization${result.total === 1 ? "" : "s"} across the platform.`}
      />

      <form method="get" className="flex flex-wrap items-center gap-2">
        <Input
          name="q"
          defaultValue={query}
          placeholder="Search name or slug…"
          className="max-w-xs"
        />
        <Button type="submit" variant="outline">
          Search
        </Button>
        {query ? (
          <Button
            variant="ghost"
            nativeButton={false}
            render={<Link href="/organizations" />}
          >
            Clear
          </Button>
        ) : null}
      </form>

      <div className="overflow-hidden rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Organization</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-end">Members</TableHead>
              <TableHead className="text-end">Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {organizations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  No organization matches this search.
                </TableCell>
              </TableRow>
            ) : (
              organizations.map((organization) => (
                <TableRow key={organization.id}>
                  <TableCell>
                    <Link
                      href={`/organizations/${organization.id}`}
                      className="flex flex-col hover:underline"
                    >
                      <span className="font-medium">{organization.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {organization.slug}
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        organization.plan === "free" ? "outline" : "secondary"
                      }
                      className="capitalize"
                    >
                      {organization.plan}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {organization.deletionScheduledAt
                      ? "deletion scheduled"
                      : (organization.subscriptionStatus ?? "inactive")}
                  </TableCell>
                  <TableCell className="text-end tabular-nums">
                    {formatNumber(organization.memberCount)}
                  </TableCell>
                  <TableCell className="text-end text-muted-foreground">
                    {formatDate(organization.createdAt)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Pagination
        basePath="/organizations"
        page={page}
        pageCount={pageCount}
        query={query ? { q: query } : {}}
        total={result.total}
      />
    </div>
  )
}
