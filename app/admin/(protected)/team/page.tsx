import { ActionForm } from "@/components/admin/ActionForm";
import { EmptyState, PageHeader, StatusBadge, adminStyles as styles } from "@/components/admin/AdminUI";
import { database } from "@/lib/platform";

export const dynamic = "force-dynamic";

type TeamRow = {
  id: string; name: string; role: string; group_name: string; photo_key: string | null; photo_alt: string | null;
  biography: string; linkedin_url: string | null; display_order: number; active: number;
};

function MemberFields({ member }: { member?: TeamRow }) {
  return (
    <div className={styles.formGrid}>
      <div className={styles.fieldThird}><label className={styles.label}>Name</label><input className={styles.input} name="name" defaultValue={member?.name} required /></div>
      <div className={styles.fieldThird}><label className={styles.label}>Role/title</label><input className={styles.input} name="role" defaultValue={member?.role} required /></div>
      <div className={styles.fieldThird}><label className={styles.label}>Team/group</label><input className={styles.input} name="groupName" defaultValue={member?.group_name} required /></div>
      <div className={styles.fieldWide}><label className={styles.label}>Short biography</label><textarea className={styles.textarea} name="biography" defaultValue={member?.biography} maxLength={1500} /></div>
      <div className={styles.fieldThird}><label className={styles.label}>Display order</label><input className={styles.input} name="displayOrder" type="number" min="0" max="10000" defaultValue={member?.display_order ?? 0} /></div>
      <div className={styles.fieldThird}><label className={styles.label}>LinkedIn URL</label><input className={styles.input} name="linkedInUrl" type="url" defaultValue={member?.linkedin_url ?? ""} /></div>
      <div className={styles.fieldThird}><label className={styles.label}>Photo asset path</label><input className={styles.input} name="photoKey" defaultValue={member?.photo_key ?? ""} placeholder="/team/name.jpg" /></div>
      <div className={styles.fieldHalf}><label className={styles.label}>Photo alternative text</label><input className={styles.input} name="photoAlt" defaultValue={member?.photo_alt ?? ""} /></div>
      {member ? <div className={styles.fieldHalf}><input type="hidden" name="activePresent" value="true" /><label className={styles.checkboxRow}><input type="checkbox" name="active" value="true" defaultChecked={Boolean(member.active)} /> Active on public Team page</label></div> : null}
    </div>
  );
}

export default async function TeamAdminPage() {
  const members = await database().prepare(
    "SELECT * FROM team_members ORDER BY group_name COLLATE NOCASE, display_order, name COLLATE NOCASE",
  ).all<TeamRow>();
  return (
    <>
      <PageHeader eyebrow="Website" title="Team" description="Create, order and activate team profiles. Inactive records remain in the administration history but do not appear publicly." />
      <section className={styles.panel}>
        <div className={styles.panelHeader}><h2 className={styles.panelTitle}>Add team member</h2><span className={styles.panelMeta}>Photographs are optional</span></div>
        <div className={styles.panelBody}><ActionForm action="/api/admin/team" submitLabel="Add team member"><MemberFields /></ActionForm></div>
      </section>
      <section className={styles.panel}>
        <div className={styles.panelHeader}><h2 className={styles.panelTitle}>Team records</h2><span className={styles.panelMeta}>{members.results.length} total</span></div>
        {members.results.length ? <div className={styles.panelBody}>{members.results.map((member) => <details key={member.id} className={styles.panel} open={false}><summary className={styles.panelHeader}><span className={styles.primaryCell}>{member.name}<span className={styles.secondaryCell}>{member.role} · {member.group_name}</span></span><StatusBadge value={member.active ? "Active" : "Inactive"} /></summary><div className={styles.panelBody}><ActionForm action={`/api/admin/team/${member.id}`} method="PATCH" submitLabel="Save team member"><MemberFields member={member} /></ActionForm></div></details>)}</div> : <EmptyState title="No team records yet">Add the first team member above. A photograph is not required; the public page can show an accessible fallback.</EmptyState>}
      </section>
    </>
  );
}
