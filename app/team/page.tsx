import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro } from "@/components/site/page-intro";
import { getPublicTeamMembers, hasManagedTeamRecords } from "@/lib/public-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Team",
  description:
    "Meet the student leaders and analysts behind M&A Watch's strategic, legal and markets research.",
  alternates: { canonical: "/team" },
};

type TeamMemberView = {
  name: string;
  role: string;
  bio: string;
  initials: string;
  colour: string;
  linkedInUrl?: string;
};

type TeamGroupView = {
  name: string;
  description: string;
  members: TeamMemberView[];
};

const defaultGroups: TeamGroupView[] = [
  {
    name: "National leadership",
    description: "Setting our direction and connecting chapters across the network.",
    members: [
      { name: "Maya Shah", role: "National President", bio: "Coordinates M&A Watch's national strategy, partnerships and chapter network.", initials: "MS", colour: "blue" },
      { name: "Edward Collins", role: "Chief Operating Officer", bio: "Leads operations and builds the systems that help our student teams do their best work.", initials: "EC", colour: "midnight" },
    ],
  },
  {
    name: "Editorial leadership",
    description: "Maintaining a high bar for clear, careful and useful research.",
    members: [
      { name: "Nadia Okafor", role: "Head of Strategic Reports", bio: "Guides our retrospective deal analysis across valuation, rationale and integration.", initials: "NO", colour: "teal" },
      { name: "Leo Bennett", role: "Head of Legal Reports", bio: "Oversees research into the legal and regulatory questions behind landmark transactions.", initials: "LB", colour: "sky" },
      { name: "Sofia Malik", role: "Head of Markets", bio: "Leads our student perspectives on macro themes, asset classes and market structure.", initials: "SM", colour: "green" },
    ],
  },
  {
    name: "Community and growth",
    description: "Making M&A Watch an ambitious and welcoming place to learn.",
    members: [
      { name: "Daniel Kim", role: "Head of Partnerships", bio: "Develops relationships with universities, societies, alumni and industry partners.", initials: "DK", colour: "charcoal" },
      { name: "Amelia Jones", role: "Head of People", bio: "Supports recruitment, development and collaboration across every division.", initials: "AJ", colour: "light" },
    ],
  },
];

export default async function TeamPage() {
  const [records, hasManagedRecords] = await Promise.all([
    getPublicTeamMembers(),
    hasManagedTeamRecords(),
  ]);
  const liveGroups = new Map<string, TeamMemberView[]>();
  const colours = ["blue", "midnight", "teal", "sky", "green", "charcoal", "light"];
  records.forEach((member, index) => {
    const list = liveGroups.get(member.groupName) ?? [];
    list.push({
      name: member.name,
      role: member.role,
      bio: member.biography,
      initials: member.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(),
      colour: colours[index % colours.length],
      linkedInUrl: member.linkedInUrl,
    });
    liveGroups.set(member.groupName, list);
  });
  const groups: TeamGroupView[] = hasManagedRecords
    ? Array.from(liveGroups, ([name, members]) => ({
        name,
        description: `Members contributing to ${name.toLocaleLowerCase("en-GB")} across the M&A Watch network.`,
        members,
      }))
    : defaultGroups;
  return (
    <main className="team-page">
      <PageIntro eyebrow="The people behind the analysis" title="Curious minds. Shared standards.">
        <p>
          We are a student-founded, student-led network united by an interest in the
          transactions that transform companies, industries and markets.
        </p>
      </PageIntro>

      <section className="team-overview section-pad">
        <div className="site-shell team-overview__grid">
          <p className="section-index">A national network</p>
          <div>
            <p className="display-copy">
              Different disciplines and universities make the work stronger.
            </p>
            <p>
              Our team combines financial analysis, legal research and market
              awareness. Every active member contributes to a culture of integrity,
              capability and constructive challenge.
            </p>
            <p className="content-note">
              These representative profiles are placeholder content and can be replaced
              with the confirmed M&amp;A Watch team before launch.
            </p>
          </div>
        </div>
      </section>

      <div className="site-shell team-groups">
        {groups.length === 0 ? (
          <section className="team-group" aria-labelledby="team-empty-title">
            <header className="team-group__header">
              <p>—</p>
              <div>
                <h2 id="team-empty-title">Team profiles are being updated.</h2>
                <p>Please check back soon for the current M&amp;A Watch team.</p>
              </div>
            </header>
          </section>
        ) : null}
        {groups.map((group, groupIndex) => (
          <section className="team-group" key={group.name} aria-labelledby={`team-group-${groupIndex}`}>
            <header className="team-group__header">
              <p>{String(groupIndex + 1).padStart(2, "0")}</p>
              <div>
                <h2 id={`team-group-${groupIndex}`}>{group.name}</h2>
                <p>{group.description}</p>
              </div>
            </header>
            <div className="team-grid">
              {group.members.map((member) => (
                <article className="team-card" key={member.name}>
                  <div className={`team-card__portrait team-card__portrait--${member.colour}`} role="img" aria-label={`Portrait placeholder for ${member.name}`}>
                    <span>{member.initials}</span>
                    <span className="team-card__portrait-line" aria-hidden="true" />
                  </div>
                  <div className="team-card__content">
                    <p className="team-card__role">{member.role}</p>
                    <h3>{member.name}</h3>
                    <p>{member.bio}</p>
                    {member.linkedInUrl ? (
                      <a href={member.linkedInUrl} rel="noreferrer" target="_blank">
                        LinkedIn <span aria-hidden="true">↗</span>
                      </a>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>

      <section className="inline-cta">
        <div className="site-shell inline-cta__grid">
          <p className="eyebrow eyebrow--light">Find your place in the network</p>
          <h2>Bring your perspective to the next report.</h2>
          <Link className="button button--light" href="/apply">Apply to join <span aria-hidden="true">→</span></Link>
        </div>
      </section>
    </main>
  );
}
