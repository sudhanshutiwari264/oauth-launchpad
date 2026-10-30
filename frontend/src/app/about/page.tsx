export default function AboutPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold tracking-tight text-neutral-900">About OAuth Launchpad</h1>

      <Section title="The problem">
        <p>
          Registering an OAuth app with a provider like GitHub, Slack, or Google means digging
          through scattered developer docs to find redirect URI rules, required scopes, and
          whether the provider needs to review or approve your app before it works for real
          users. OAuth Launchpad collects that into one actionable guide per provider, and can
          research a provider it doesn&apos;t already know about.
        </p>
      </Section>

      <Section title="Two ways to connect: your own app, or a shared one">
        <p>
          To let your app or agent connect to something like GitHub or Slack, you need to
          register what&apos;s called an <span className="font-medium">OAuth app</span> with
          that provider - it&apos;s how the provider knows who&apos;s asking for access, and
          what your users see when they approve it. You have two options:
        </p>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li>
            <span className="font-medium">Register your own.</span> You fill out a form with the
            provider. Takes a bit of setup, but your users see your name and logo when they
            approve access, and you&apos;re not relying on anyone else.
          </li>
          <li>
            <span className="font-medium">Use a shared one.</span> A third-party service has
            already registered and gotten approved - you piggyback on theirs instead. Faster to
            start, but your users see the third party&apos;s branding, not yours.
          </li>
        </ul>
        <p className="mt-3">
          Each guide&apos;s &ldquo;Recommended setup path&rdquo; tells you which option makes
          more sense for that provider: it suggests registering your own whenever that&apos;s
          quick and easy (true for most providers), and only suggests the shared route when the
          provider makes registering your own unusually slow. If the evidence isn&apos;t clear
          either way, it says so instead of guessing.
        </p>
      </Section>

      <Section title="How a guide actually gets written">
        <p>
          When you ask for a guide, here&apos;s exactly what happens, in order: we search the
          web (via Tavily) for that provider&apos;s own official setup instructions, open and
          read the actual pages, and hand that text to an AI model (via TarqaAI) whose only job
          is to turn it into a step-by-step checklist - it&apos;s told to use only what the
          pages actually say, never to fill in blanks from memory. Nothing about a guide is
          pre-written: every one is built fresh, from real pages, at the moment you ask for it.
        </p>
      </Section>

      <Section title="How to tell what's solid and what's not">
        <p>
          Every guide lists exactly which pages it was built from, and marks each one
          &ldquo;verified&rdquo; (actually from the provider&apos;s own website) or
          &ldquo;unverified&rdquo; (from somewhere else, so treat it with a bit more caution).
          If the official docs don&apos;t clearly answer something, that shows up under
          &ldquo;Open questions&rdquo; instead of us guessing an answer. Time estimates are
          split into two separate numbers on purpose: how long the hands-on setup work takes
          you, and how long you might have to wait for the provider to review and approve your
          app - those are two very different kinds of waiting, and neither one is a promise.
        </p>
      </Section>

      <Section title="What this tool can and can't do for you">
        <p>
          It can read public documentation and turn it into a checklist you can follow. It
          can&apos;t create an OAuth app on your behalf, log into any of your accounts, or
          submit anything to a provider for review - a person has to do those parts. Every step
          in a guide says who&apos;s responsible for it: you (the developer), the provider, or
          this tool (the agent).
        </p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="font-semibold text-neutral-900">{title}</h2>
      <div className="mt-2 text-neutral-700">{children}</div>
    </section>
  );
}
