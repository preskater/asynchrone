import { AnnouncementBar } from "@/components/landing/announcement-bar"
import { Navbar } from "@/components/landing/navbar"
import { Footer } from "@/components/landing/footer"

/**
 * The landing is anonymous: no session, no personalized state. Account actions
 * link out to Copilot.
 */
export default function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <AnnouncementBar />
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  )
}
