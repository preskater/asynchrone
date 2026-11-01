import fs from "node:fs"
import path from "node:path"

import { routing } from "@workspace/i18n/routing"

export interface BlogFrontmatter {
  title: string
  description: string
  date: string
  author: string
  tag: string
}

export interface BlogPostMeta extends BlogFrontmatter {
  slug: string
}

const contentRoot = path.join(process.cwd(), "content", "blog")

function blogDir(locale: string) {
  const dir = path.join(contentRoot, locale)
  if (fs.existsSync(dir)) return dir
  return path.join(contentRoot, routing.defaultLocale)
}

function parseFrontmatter(source: string): Record<string, string> {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match || !match[1]) return {}
  const block = match[1]
  const result: Record<string, string> = {}
  for (const line of block.split(/\r?\n/)) {
    const separator = line.indexOf(":")
    if (separator === -1) continue
    const key = line.slice(0, separator).trim()
    const raw = line.slice(separator + 1).trim()
    result[key] = raw.replace(/^["']|["']$/g, "")
  }
  return result
}

export function getBlogSlugs(): string[] {
  const dir = path.join(contentRoot, routing.defaultLocale)
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".mdx"))
    .map((file) => file.replace(/\.mdx$/, ""))
}

export function getPost(
  slug: string,
  locale: string = routing.defaultLocale
): BlogPostMeta | undefined {
  const filePath = path.join(blogDir(locale), `${slug}.mdx`)
  if (!fs.existsSync(filePath)) return undefined
  const source = fs.readFileSync(filePath, "utf8")
  const data = parseFrontmatter(source)
  return {
    slug,
    title: data.title ?? slug,
    description: data.description ?? "",
    date: data.date ?? "",
    author: data.author ?? "Asynchrone Space",
    tag: data.tag ?? "Product",
  }
}

export function getAllPosts(
  locale: string = routing.defaultLocale
): BlogPostMeta[] {
  return getBlogSlugs()
    .map((slug) => getPost(slug, locale))
    .filter((post): post is BlogPostMeta => post !== undefined)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}
