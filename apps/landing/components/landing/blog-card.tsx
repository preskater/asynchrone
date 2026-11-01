import { ArrowRightIcon } from "lucide-react"
import { getFormatter, getTranslations } from "next-intl/server"

import { Link } from "@workspace/i18n/navigation"
import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { type BlogPostMeta } from "@/lib/landing/blog"

export async function BlogCard({ post }: { post: BlogPostMeta }) {
  const t = await getTranslations("Marketing.blog")
  const format = await getFormatter()
  return (
    <Card className="h-full transition-colors hover:ring-foreground/20">
      <CardHeader>
        <div className="mb-1 flex items-center gap-2">
          <Badge variant="secondary">{post.tag}</Badge>
          <span className="text-xs text-muted-foreground">
            {format.dateTime(new Date(post.date), {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </span>
        </div>
        <CardTitle className="text-lg">
          <Link href={`/blog/${post.slug}`}>{post.title}</Link>
        </CardTitle>
        <CardDescription>{post.description}</CardDescription>
      </CardHeader>
      <CardFooter className="text-sm text-muted-foreground">
        <span>{post.author}</span>
        <Link
          href={`/blog/${post.slug}`}
          className="ms-auto inline-flex items-center gap-1 font-medium text-primary hover:underline"
        >
          {t("read")}
          <ArrowRightIcon className="size-3.5" />
        </Link>
      </CardFooter>
    </Card>
  )
}
