"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import {
  CalendarDaysIcon,
  CheckCircle2Icon,
  FileTextIcon,
  HashIcon,
  ImageIcon,
  MessageSquareIcon,
} from "lucide-react"

import { Section, SectionHeading } from "@/components/landing/section"
import { Avatar, AvatarFallback } from "@workspace/ui/components/avatar"
import { AspectRatio } from "@workspace/ui/components/aspect-ratio"
import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Progress } from "@workspace/ui/components/progress"
import { Separator } from "@workspace/ui/components/separator"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import { showcaseTabs } from "@/lib/landing/content"

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <AspectRatio
      ratio={16 / 9}
      className="overflow-hidden rounded-xl bg-muted/30 ring-1 ring-foreground/10"
    >
      <div className="size-full p-3 sm:p-4">{children}</div>
    </AspectRatio>
  )
}

function ProjectsMock() {
  const t = useTranslations("Landing.showcase")
  const columns = [
    { key: "todo", tasks: ["taskApiKey", "taskSandbox"] },
    { key: "inProgress", tasks: ["taskRateLimit"] },
    { key: "done", tasks: ["taskOpenApi"] },
  ]
  return (
    <Frame>
      <div className="grid h-full grid-cols-3 gap-3">
        {columns.map((column) => (
          <div
            key={column.key}
            className="flex flex-col gap-2 rounded-lg bg-background/60 p-2"
          >
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-medium">
                {t(column.key as never)}
              </span>
              <Badge variant="outline" className="tabular-nums">
                {column.tasks.length}
              </Badge>
            </div>
            {column.tasks.map((task, index) => (
              <div
                key={task}
                className="rounded-md bg-card p-2 text-xs shadow-sm ring-1 ring-foreground/5"
              >
                <span className="text-muted-foreground">API-{index + 1}</span>
                <p className="font-medium">{t(task as never)}</p>
                <div className="mt-1 flex items-center justify-between">
                  <Badge variant="secondary">{t("medium")}</Badge>
                  <Avatar size="sm">
                    <AvatarFallback>AC</AvatarFallback>
                  </Avatar>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Frame>
  )
}

function MessagesMock() {
  const t = useTranslations("Landing.showcase")
  const messages = [
    { initials: "MR", name: "Marcus Reid", body: "msg1" },
    { initials: "PN", name: "Priya Nair", body: "msg2" },
    { initials: "AC", name: "Aria Chen", body: "msg3" },
  ]
  return (
    <Frame>
      <div className="flex h-full flex-col">
        <div className="mb-2 flex items-center gap-2 border-b pb-2">
          <HashIcon className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">{t("channelEngineering")}</span>
          <Badge variant="secondary" className="ms-auto">
            {t("membersCount", { count: 5 })}
          </Badge>
        </div>
        <div className="flex flex-1 flex-col justify-end gap-3">
          {messages.map((message, index) => (
            <div key={message.name} className="flex items-start gap-2">
              <Avatar size="sm">
                <AvatarFallback>{message.initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">{message.name}</span>
                  <span className="text-xs text-muted-foreground">
                    10:0{index + 1}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t(message.body as never)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Frame>
  )
}

function CalendarsMock() {
  const t = useTranslations("Landing.showcase")
  const events = [
    { time: "9:00", title: "eventStandup" },
    { time: "10:00", title: "eventCritique" },
    { time: "15:00", title: "eventRoadmap" },
  ]
  const days = ["mon", "tue", "wed", "thu", "fri"]
  return (
    <Frame>
      <div className="grid h-full grid-cols-5 gap-2">
        {days.map((day, index) => (
          <div key={day} className="flex flex-col gap-2">
            <span className="text-center text-xs text-muted-foreground">
              {t(day as never)}
            </span>
            {index === 2 ? (
              <div className="flex flex-col gap-1">
                {events.map((event) => (
                  <div
                    key={event.title}
                    className="rounded border-s-2 border-[color:var(--chart-3)] bg-[color:var(--chart-3)]/15 p-1.5 text-[0.65rem] leading-tight"
                  >
                    <span className="block text-muted-foreground">
                      {event.time}
                    </span>
                    <span className="font-medium">
                      {t(event.title as never)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex-1 rounded bg-background/50" />
            )}
          </div>
        ))}
      </div>
    </Frame>
  )
}

function FilesMock() {
  const t = useTranslations("Landing.showcase")
  const files = [
    {
      icon: FileTextIcon,
      name: "fileRoadmap",
      owner: "Marcus",
      size: "1.4 MB",
    },
    { icon: ImageIcon, name: "fileHero", owner: "Priya", size: "3.2 MB" },
    { icon: FileTextIcon, name: "fileTokens", owner: "Priya", size: "1.1 MB" },
  ]
  return (
    <Frame>
      <div className="flex h-full flex-col gap-2">
        <div className="grid grid-cols-[1fr_auto_auto] gap-2 border-b pb-2 text-xs text-muted-foreground">
          <span>{t("name")}</span>
          <span>{t("owner")}</span>
          <span>{t("size")}</span>
        </div>
        {files.map((file) => (
          <div
            key={file.name}
            className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-md bg-card px-2 py-1.5 text-sm ring-1 ring-foreground/5"
          >
            <span className="flex items-center gap-2 truncate">
              <file.icon className="size-4 text-muted-foreground" />
              <span className="truncate">{t(file.name as never)}</span>
            </span>
            <span className="text-xs text-muted-foreground">{file.owner}</span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {file.size}
            </span>
          </div>
        ))}
      </div>
    </Frame>
  )
}

const MOCKS: Record<string, React.ReactNode> = {
  projects: <ProjectsMock />,
  messages: <MessagesMock />,
  calendars: <CalendarsMock />,
  files: <FilesMock />,
}

export function ProductShowcase() {
  const t = useTranslations("Landing.showcase")
  return (
    <Section id="showcase" className="bg-muted/30">
      <SectionHeading
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
      />
      <Tabs
        defaultValue="projects"
        className="mt-12 flex flex-col items-center gap-6"
      >
        <TabsList>
          {showcaseTabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {t(tab.value as never)}
            </TabsTrigger>
          ))}
        </TabsList>
        {showcaseTabs.map((tab) => (
          <TabsContent key={tab.value} value={tab.value} className="w-full">
            <Card className="overflow-hidden">
              <CardHeader>
                <CardTitle>{t(`${tab.value}Heading` as never)}</CardTitle>
                <CardDescription>
                  {t(`${tab.value}Description` as never)}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
                  {MOCKS[tab.value]}
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <Stat
                    icon={CheckCircle2Icon}
                    label={t("tasksShipped")}
                    value="1,240"
                  />
                  <Stat
                    icon={MessageSquareIcon}
                    label={t("messagesSent")}
                    value="8,900"
                  />
                  <Stat
                    icon={CalendarDaysIcon}
                    label={t("meetingsSynced")}
                    value="310"
                  />
                </div>
                <Separator className="my-4" />
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {t("teamAdoption")}
                    </span>
                    <span className="tabular-nums">86%</span>
                  </div>
                  <Progress value={86} />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </Section>
  )
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <span className="flex size-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <div className="flex flex-col">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{value}</span>
      </div>
    </div>
  )
}
