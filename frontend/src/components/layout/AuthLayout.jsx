import { FileCheck2, ShieldCheck, Sparkles, UsersRound } from "lucide-react";

import MbcLogo from "@/components/brand/MbcLogo";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

const divisionChips = ["Big Data", "Cyber Security", "Game Technology", "GIS"];

export default function AuthLayout({
  title,
  description,
  eyebrow = "MBC Laboratory Recruitment",
  children,
  sideTitle = "MBC Laboratory Recruitment Portal",
  sideDescription = "One official portal for candidates to take part in the selection process, manage documents, and track their registration status.",
  sideContent,
  footer,
  className,
}) {
  return (
    <main
      className={cx(
        "min-h-screen bg-background text-foreground",
        "bg-[linear-gradient(180deg,var(--background)_0%,var(--surface-container-low)_100%)]",
        className
      )}
    >
      <div className="mx-auto grid min-h-screen w-full max-w-7xl grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(420px,500px)]">
        <section className="brand-gradient relative hidden min-h-screen overflow-hidden px-10 py-12 text-white lg:flex lg:flex-col lg:justify-between xl:px-14">
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.16)_0%,rgba(255,255,255,0)_44%)]" />
          <div className="relative z-10 flex items-center justify-between gap-4">
            <MbcLogo variant="white" size="lg" className="drop-shadow-sm" />
            <div className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-white/90">
              ScreenAI Lab
            </div>
          </div>

          <div className="relative z-10 max-w-xl py-16">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-white/90">
              <Sparkles className="h-3.5 w-3.5" />
              Official recruitment
            </div>
            <h1 className="font-heading text-4xl font-bold leading-tight tracking-normal xl:text-5xl">
              {sideTitle}
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-white/80">
              {sideDescription}
            </p>

            {sideContent || (
              <div className="mt-10 rounded-2xl border border-white/20 bg-white/10 p-5 shadow-[0_18px_44px_rgba(13,13,13,0.18)] backdrop-blur-xl">
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-primary-deep">
                    <FileCheck2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-heading text-lg font-bold tracking-normal">
                      Structured selection stages
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-white/75">
                      Track registration, document verification, evaluation, and announcements in one clear flow.
                    </p>
                  </div>
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  {divisionChips.map((division) => (
                    <span
                      key={division}
                      className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-white/90"
                    >
                      {division}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="relative z-10 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur-xl">
              <ShieldCheck className="h-5 w-5 text-white" />
              <div className="mt-3 font-heading text-sm font-bold tracking-normal">
                Candidate data is secure
              </div>
              <p className="mt-1 text-xs leading-5 text-white/70">
                The selection process runs through the official MBC Laboratory portal.
              </p>
            </div>
            <div className="rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur-xl">
              <UsersRound className="h-5 w-5 text-white" />
              <div className="mt-3 font-heading text-sm font-bold tracking-normal">
                Collaborative focus
              </div>
              <p className="mt-1 text-xs leading-5 text-white/70">
                Choose a division and follow the recruitment process with easy-to-track status.
              </p>
            </div>
          </div>
        </section>

        <section className="flex min-h-screen items-center justify-center px-4 py-8 sm:px-6 lg:px-10">
          <div className="w-full max-w-xl">
            <div className="mb-7 flex justify-center lg:hidden">
              <MbcLogo variant="primary" size="lg" />
            </div>

            <Card className="brand-card gap-0 rounded-2xl border-transparent py-0 shadow-[var(--shadow-navy)]">
              <CardHeader className="gap-3 px-5 pb-3 pt-6 text-center sm:px-8 sm:pt-8">
                {eyebrow && (
                  <div className="mx-auto w-fit rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-primary-deep">
                    {eyebrow}
                  </div>
                )}
                <CardTitle className="font-heading text-2xl font-bold leading-tight tracking-normal text-foreground sm:text-3xl">
                  {title}
                </CardTitle>
                {description && (
                  <CardDescription className="mx-auto max-w-md text-sm leading-6 text-muted-foreground">
                    {description}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="px-5 pb-6 pt-3 sm:px-8 sm:pb-8">
                {children}
                {footer && (
                  <div className="mt-6 border-t border-border/70 pt-5">
                    {footer}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </main>
  );
}
