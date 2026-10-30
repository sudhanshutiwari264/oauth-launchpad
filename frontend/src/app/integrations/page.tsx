import Link from "next/link";
import { BookIcon, ChatIcon, RocketIcon, SearchIcon } from "@/components/icons";

const STEPS = [
  {
    icon: SearchIcon,
    title: "Search or paste a URL",
    body: "Open an existing guide, or enter any app's name or website to have one researched.",
  },
  {
    icon: BookIcon,
    title: "We read the official docs",
    body: "Developer portals, OAuth references, and scope lists — not forums, not guesses, not training-data memory.",
  },
  {
    icon: ChatIcon,
    title: "Follow a sourced checklist",
    body: "Tick off each step, copy exact values, and share the guide with your team.",
  },
];

export default function IntegrationsPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
        <RocketIcon className="h-3.5 w-3.5" />
        Integrations
      </span>
      <h1 className="mt-4 text-3xl font-bold tracking-tight text-neutral-900">
        What &ldquo;connecting an integration&rdquo; actually means
      </h1>
      <p className="mt-3 text-neutral-600">
        When people say they want to &ldquo;connect to Slack&rdquo; or &ldquo;add a GitHub integration,&rdquo; what
        they mean is: their app needs to speak OAuth with that provider. There are three parties in that
        relationship — the <strong className="font-medium text-neutral-900">provider</strong> (Slack,
        GitHub, Google...), <strong className="font-medium text-neutral-900">your app or agent</strong>{" "}
        (the integration itself), and the{" "}
        <strong className="font-medium text-neutral-900">end user</strong> who clicks &ldquo;allow.&rdquo;
        Every guide on this site is the setup checklist for that middle piece: registering your app with the
        provider so a real user can authorize it.
      </p>

      <h2 className="mt-10 text-lg font-semibold text-neutral-900">How it works</h2>
      <div className="mt-5 grid grid-cols-1 gap-6 sm:grid-cols-3">
        {STEPS.map((step, index) => (
          <div key={step.title}>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-blue-600">
              <step.icon className="h-4 w-4" />
            </span>
            <p className="mt-3 text-xs font-semibold text-blue-600">
              {String(index + 1).padStart(2, "0")}
            </p>
            <h3 className="mt-1 font-semibold text-neutral-900">{step.title}</h3>
            <p className="mt-1.5 text-sm text-neutral-500">{step.body}</p>
          </div>
        ))}
      </div>

      <div className="mt-10 rounded-2xl border border-neutral-200 bg-neutral-50 p-5 shadow-sm">
        <h3 className="font-semibold text-neutral-900">Two ways to register that app</h3>
        <p className="mt-1.5 text-sm text-neutral-600">
          Register your own OAuth app with the provider (full control over branding, a bit of setup), or use a
          shared app from a third-party auth aggregator (faster to start, their branding instead of yours). Every
          guide&apos;s &ldquo;Recommended setup path&rdquo; weighs that trade-off for that specific provider instead
          of guessing. The full breakdown is on the{" "}
          <Link href="/about" className="font-medium text-blue-600 hover:underline">
            About page
          </Link>
          .
        </p>
      </div>

      <div className="mt-6 flex items-center justify-between gap-4 rounded-2xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
        <div>
          <p className="font-medium text-blue-900">Ready to connect something?</p>
          <p className="text-sm text-blue-700">Browse existing guides or research a new one live.</p>
        </div>
        <Link
          href="/generate"
          className="shrink-0 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
        >
          Generate a guide
        </Link>
      </div>
    </div>
  );
}
