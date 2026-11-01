import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getFormatter, getTranslations } from "next-intl/server"
import { ArrowLeftIcon } from "lucide-react"

import { Link } from "@workspace/i18n/navigation"
import { Container } from "@/components/landing/section"
import { Badge } from "@workspace/ui/components/badge"
import { Separator } from "@workspace/ui/components/separator"

import { getPost, getBlogSlugs, type BlogFrontmatter } from "@/lib/landing/blog"
import { marketingMetadata } from "@/lib/seo"

type PostModule = {
  default: React.ComponentType
  frontmatter?: BlogFrontmatter
}

export function generateStaticParams() {
  return getBlogSlugs().map((slug) => ({ slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>
}): Promise<Metadata> {
  const { slug, locale } = await params
  const post = getPost(slug, locale)
  if (!post) return {}
  return marketingMetadata({
    path: `/blog/${slug}`,
    title: post.title,
    description: post.description,
  })
}

const postsEn = {
  "ai-native-workflows": () =>
    import("@/content/blog/en/ai-native-workflows.mdx"),
  "one-workspace": () => import("@/content/blog/en/one-workspace.mdx"),
  "security-built-in": () => import("@/content/blog/en/security-built-in.mdx"),
  "team-scheduling": () => import("@/content/blog/en/team-scheduling.mdx"),
} as const

const postsFr = {
  "ai-native-workflows": () =>
    import("@/content/blog/fr/ai-native-workflows.mdx"),
  "one-workspace": () => import("@/content/blog/fr/one-workspace.mdx"),
  "security-built-in": () => import("@/content/blog/fr/security-built-in.mdx"),
  "team-scheduling": () => import("@/content/blog/fr/team-scheduling.mdx"),
} as const

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>
}) {
  const { slug, locale } = await params
  const post = getPost(slug, locale)
  if (!post) notFound()

  const t = await getTranslations("Marketing.blog")
  const format = await getFormatter()

  const loader = (locale === "fr" ? postsFr : postsEn)[
    slug as keyof typeof postsEn
  ]
  if (!loader) notFound()
  const { default: Post } = (await loader()) as PostModule

  return (
    <>
      <section className="border-b bg-muted/30 py-14 sm:py-16">
        <Container>
          <div className="mx-auto max-w-3xl">
            <Link
              href="/blog"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeftIcon className="size-3.5" />
              {t("allPosts")}
            </Link>
            <div className="mt-6 flex items-center gap-3">
              <Badge variant="secondary">{post.tag}</Badge>
              <span className="text-sm text-muted-foreground">
                {format.dateTime(new Date(post.date), {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </span>
            </div>
            <h1 className="mt-4 font-heading text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              {post.title}
            </h1>
            <p className="mt-4 text-lg text-pretty text-muted-foreground">
              {post.description}
            </p>
            <p className="mt-4 text-sm text-muted-foreground">
              {t("by", { author: post.author })}
            </p>
          </div>
        </Container>
      </section>

      <Container className="py-14">
        <article className="mx-auto max-w-3xl">
          <Post />
          <Separator className="my-12" />
          <Link
            href="/blog"
            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
          >
            <ArrowLeftIcon className="size-4" />
            {t("backToPosts")}
          </Link>
        </article>
      </Container>
    </>
  )
}
