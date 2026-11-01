export interface NavLink {
  key: string
  href: string
}

export interface NavColumn {
  key: "product" | "solutions" | "resources" | "company"
  links: NavLink[]
}

export const productNav: NavColumn = {
  key: "product",
  links: [
    { key: "projects", href: "/features" },
    { key: "messaging", href: "/features" },
    { key: "calendars", href: "/features" },
    { key: "files", href: "/features" },
  ],
}

export const solutionNav: NavColumn = {
  key: "solutions",
  links: [
    { key: "engineering", href: "/features" },
    { key: "design", href: "/features" },
    { key: "operations", href: "/features" },
    { key: "startups", href: "/pricing" },
  ],
}

export const resourceNav: NavColumn = {
  key: "resources",
  links: [
    { key: "documentation", href: "/faq" },
    { key: "blog", href: "/blog" },
    { key: "community", href: "/blog" },
    { key: "support", href: "/faq" },
  ],
}

export const companyNav: NavColumn = {
  key: "company",
  links: [
    { key: "about", href: "/about" },
    { key: "careers", href: "/careers" },
    { key: "contact", href: "/contact" },
    { key: "pricing", href: "/pricing" },
  ],
}

export const logos = [
  "Northwind",
  "Acme Corp",
  "Globex",
  "Initech",
  "Umbrella",
  "Hooli",
]

export interface Feature {
  icon: "zap" | "users" | "calendar" | "folder" | "message" | "shield"
  title: string
  description: string
}

export const features: Feature[] = [
  {
    icon: "zap",
    title: "AI-native workflows",
    description:
      "Automate standups, summaries and task updates so your team stays focused on the work that matters.",
  },
  {
    icon: "users",
    title: "Everything in one place",
    description:
      "Projects, messaging, calendars and files share the same people, context and permissions.",
  },
  {
    icon: "shield",
    title: "Enterprise-grade security",
    description:
      "Organizations, roles and granular permissions built in — with SSO-ready authentication.",
  },
  {
    icon: "calendar",
    title: "Scheduling that just works",
    description:
      "See team availability, schedule meetings and sync events across every calendar view.",
  },
  {
    icon: "folder",
    title: "Files with real permissions",
    description:
      "Share documents with view, comment or edit access — down to the individual file.",
  },
  {
    icon: "message",
    title: "Conversations with context",
    description:
      "Threads, reactions and mentions keep discussions attached to the work they're about.",
  },
]

export interface ShowcaseTab {
  value: string
  label: string
  heading: string
  description: string
}

export const showcaseTabs: ShowcaseTab[] = [
  {
    value: "projects",
    label: "Projects",
    heading: "Plan and ship with Kanban boards",
    description:
      "Organize work into boards, track progress and keep every task tied to the people and files it touches.",
  },
  {
    value: "messages",
    label: "Messages",
    heading: "Chat that stays in context",
    description:
      "Channels, direct messages and threads keep your team aligned without losing the thread.",
  },
  {
    value: "calendars",
    label: "Calendars",
    heading: "One calendar for the whole team",
    description:
      "Schedule across projects with shared availability, reminders and meeting cards.",
  },
  {
    value: "files",
    label: "Files",
    heading: "Documents with real permissions",
    description:
      "Store, preview and share files with granular access — right next to your projects.",
  },
]

export interface Testimonial {
  quote: string
  name: string
  role: string
  initials: string
}

export const testimonials: Testimonial[] = [
  {
    quote:
      "Asynchrone Space replaced four tools for us. Projects, chat and files finally live in the same place, so context never gets lost.",
    name: "Aria Chen",
    role: "Head of Product, Northwind",
    initials: "AC",
  },
  {
    quote:
      "The AI assistants handle the busywork — standups, summaries, task updates. My team got a full day back every week.",
    name: "Marcus Reid",
    role: "Engineering Lead, Globex",
    initials: "MR",
  },
  {
    quote:
      "Permissions and organizations were ready out of the box. We rolled it out to 200 people in an afternoon.",
    name: "Priya Nair",
    role: "COO, Initech",
    initials: "PN",
  },
  {
    quote:
      "It feels like a single product instead of a bundle. The calendar and files are as good as the project boards.",
    name: "Lena Fischer",
    role: "Design Director, Umbrella",
    initials: "LF",
  },
]

export interface PricingTier {
  name: string
  monthly: number
  yearly: number
  description: string
  features: string[]
  featured?: boolean
  cta: string
}

export const pricingTiers: PricingTier[] = [
  {
    name: "Starter",
    monthly: 0,
    yearly: 0,
    description: "For individuals and small teams getting started.",
    features: [
      "Up to 5 members",
      "Projects and tasks",
      "Messaging and threads",
      "1 GB of file storage",
    ],
    cta: "Start for free",
  },
  {
    name: "Team",
    monthly: 12,
    yearly: 10,
    description: "For growing teams that need it all.",
    features: [
      "Up to 100 members",
      "Calendars and availability",
      "AI assistants",
      "100 GB of file storage",
      "Granular permissions",
    ],
    featured: true,
    cta: "Get started",
  },
  {
    name: "Enterprise",
    monthly: 0,
    yearly: 0,
    description: "For organizations with advanced needs.",
    features: [
      "Everything in Team",
      "SSO and SCIM (coming soon)",
      "Audit log, export and configurable retention",
      "1 TB of file storage",
      "Dedicated support",
    ],
    cta: "Contact sales",
  },
]

export interface FaqItem {
  value: string
  question: string
  answer: string
}

export const faqs: FaqItem[] = [
  {
    value: "free",
    question: "How does the free plan work?",
    answer:
      "The Starter plan is free forever and includes projects, tasks, messaging and 1 GB of storage. No credit card required.",
  },
  {
    value: "ai",
    question: "How do the AI assistants fit in?",
    answer:
      "Assistants live inside your workspace. They can summarize threads, draft task updates and answer questions about your projects, files and calendar.",
  },
  {
    value: "security",
    question: "Is my data secure?",
    answer:
      "Yes. Data is encrypted in transit and at rest, and organizations include role-based access control. SSO, SCIM, a customer-facing audit log and configurable retention are Enterprise features.",
  },
  {
    value: "migrate",
    question: "Can I import from other tools?",
    answer:
      "You can bring your team over quickly — invite members by email and import your client companies and contacts from a CSV file.",
  },
]

export interface FooterColumn {
  key: "product" | "company" | "resources" | "legal"
  links: { key: string; href: string }[]
}

export const footerColumns: FooterColumn[] = [
  {
    key: "product",
    links: [
      { key: "features", href: "/features" },
      { key: "pricing", href: "/pricing" },
      { key: "faq", href: "/faq" },
      { key: "blog", href: "/blog" },
    ],
  },
  {
    key: "company",
    links: [
      { key: "about", href: "/about" },
      { key: "careers", href: "/careers" },
      { key: "contact", href: "/contact" },
      { key: "blog", href: "/blog" },
    ],
  },
  {
    key: "resources",
    links: [
      { key: "documentation", href: "/faq" },
      { key: "support", href: "/faq" },
      { key: "community", href: "/blog" },
      { key: "changelog", href: "/blog" },
    ],
  },
  {
    key: "legal",
    links: [
      { key: "privacy", href: "/legal/privacy" },
      { key: "terms", href: "/legal/terms" },
      { key: "security", href: "/legal/security" },
      { key: "cookies", href: "/legal/cookies" },
      { key: "dpa", href: "/legal/dpa" },
      { key: "subprocessors", href: "/legal/subprocessors" },
    ],
  },
]

export const companyValues: { key: string }[] = [
  { key: "clarity" },
  { key: "ai" },
  { key: "workspace" },
]

export const companyStats: { value: string; key: string }[] = [
  { value: "2019", key: "statFounded" },
  { value: "48", key: "statTeamMembers" },
  { value: "6", key: "statCountries" },
  { value: "12k+", key: "statTeamsOnboarded" },
]

export interface Job {
  id: string
  prefix: string
}

export const jobs: Job[] = [
  { id: "senior-frontend", prefix: "seniorFrontend" },
  { id: "product-designer", prefix: "productDesigner" },
  { id: "ai-engineer", prefix: "aiEngineer" },
  { id: "customer-success", prefix: "customerSuccess" },
]

export const contactChannels: { key: string; detail: string }[] = [
  { key: "sales", detail: "sales@asynchrone.space" },
  { key: "support", detail: "support@asynchrone.space" },
  { key: "careers", detail: "careers@asynchrone.space" },
]
