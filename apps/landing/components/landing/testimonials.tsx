"use client"

import { useTranslations } from "next-intl"
import { QuoteIcon } from "lucide-react"

import { Section, SectionHeading } from "@/components/landing/section"
import { Avatar, AvatarFallback } from "@workspace/ui/components/avatar"
import { Card, CardContent } from "@workspace/ui/components/card"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@workspace/ui/components/carousel"
import { testimonials } from "@/lib/landing/content"

const TESTIMONIAL_KEYS = ["q1", "q2", "q3", "q4"]

export function Testimonials() {
  const t = useTranslations("Landing.testimonials")
  return (
    <Section id="testimonials">
      <SectionHeading
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
      />
      <Carousel
        opts={{ align: "start", loop: true }}
        className="mx-auto mt-12 w-full max-w-5xl"
      >
        <CarouselContent>
          {testimonials.map((testimonial, index) => (
            <CarouselItem
              key={testimonial.name}
              className="md:basis-1/2 lg:basis-1/3"
            >
              <Card className="h-full">
                <CardContent className="flex h-full flex-col gap-4 pt-6">
                  <QuoteIcon className="size-6 text-primary/40" />
                  <p className="flex-1 text-sm text-pretty">
                    {t((TESTIMONIAL_KEYS[index] ?? "q1") as never)}
                  </p>
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarFallback>{testimonial.initials}</AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">
                        {testimonial.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {t(`${TESTIMONIAL_KEYS[index] ?? "q1"}Role` as never)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious className="hidden md:inline-flex" />
        <CarouselNext className="hidden md:inline-flex" />
      </Carousel>
    </Section>
  )
}
