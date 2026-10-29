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

      <Section title="Managed vs. custom OAuth apps">
        <p>
          There are three parties in any OAuth integration: the <span className="font-medium">provider</span>{" "}
          (GitHub, Slack, Google), your <span className="font-medium">integration</span> (the app or agent
          that wants access), and the <span className="font-medium">end user</span> who authorizes it. The
          provider OAuth app your users authorize can either be one you register yourself (
          <span className="font-medium">custom</span>) or one already registered and approved by a
          third-party auth aggregator on your behalf (<span className="font-medium">managed</span>). Managed
          apps skip registration entirely but show the aggregator&apos;s branding on the consent screen
          instead of yours. Each guide&apos;s &ldquo;Recommended setup path&rdquo; weighs that trade-off: it
          leans custom when registration is fast and self-serve (most providers), and only suggests managed
          when the evidence shows custom registration is unusually slow - defaulting to &ldquo;unknown&rdquo;
          whenever the evidence doesn&apos;t clearly support either answer.
        </p>
      </Section>

      <Section title="How the research works">
        <p>
          When you generate a guide, the backend runs a fixed sequence of steps: identify the
          provider&apos;s official site, search for its OAuth/developer documentation using{" "}
          <span className="font-medium">Parallel</span>&apos;s web search, fetch the most
          relevant pages, and send those excerpts to an LLM (via{" "}
          <span className="font-medium">TarqaAI</span>) to extract structured setup
          requirements. Every step is real - there is no simulated progress or hardcoded guide
          data.
        </p>
      </Section>

      <Section title="Sources and uncertainty">
        <p>
          Every guide lists the documentation pages it was built from, with a link and a
          verification status: pages fetched from the provider&apos;s own domain are marked
          “verified”; anything else is “unverified.” The model is instructed to leave a field
          empty rather than guess, and anything the documentation didn&apos;t cover is listed
          under “Unknowns” instead of being invented. Estimated setup effort and approval wait
          times are clearly separate: effort is our estimate of engineering time, wait time is
          time spent waiting on the provider, and neither is presented as a guarantee.
        </p>
      </Section>

      <Section title="What the agent can and cannot do">
        <p>
          The agent can research public documentation and turn it into a structured guide. It
          cannot register an OAuth app on your behalf, access your accounts, or submit anything
          for provider review or approval - those steps always require a human developer, and
          the guide&apos;s setup steps say explicitly whether a step is handled by the agent,
          the developer, or the provider.
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
