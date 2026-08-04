import Image from "next/image";
import { ActionForm } from "@/components/admin/ActionForm";
import { EmptyState, PageHeader, StatusBadge, adminStyles as styles } from "@/components/admin/AdminUI";
import { database } from "@/lib/platform";

export const dynamic = "force-dynamic";

type TeamRow = {
  id: string; name: string; role: string; group_name: string; photo_key: string | null; photo_alt: string | null;
  biography: string; linkedin_url: string | null; display_order: number; active: number;
  updated_at: number;
};

function MemberFields({ member }: { member?: TeamRow }) {
  const fieldPrefix = member?.id ?? "new-team-member";
  return (
    <div className={styles.formGrid}>
      <div className={styles.fieldThird}><label className={styles.label} htmlFor={`${fieldPrefix}-name`}>Name</label><input className={styles.input} id={`${fieldPrefix}-name`} name="name" defaultValue={member?.name} required /></div>
      <div className={styles.fieldThird}><label className={styles.label} htmlFor={`${fieldPrefix}-role`}>Role/title</label><input className={styles.input} id={`${fieldPrefix}-role`} name="role" defaultValue={member?.role} required /></div>
      <div className={styles.fieldThird}><label className={styles.label} htmlFor={`${fieldPrefix}-group`}>Team/group</label><input className={styles.input} id={`${fieldPrefix}-group`} name="groupName" defaultValue={member?.group_name} required /></div>
      <div className={styles.fieldWide}><label className={styles.label} htmlFor={`${fieldPrefix}-biography`}>Short biography</label><textarea className={styles.textarea} id={`${fieldPrefix}-biography`} name="biography" defaultValue={member?.biography} maxLength={1500} /></div>
      <div className={styles.fieldThird}><label className={styles.label} htmlFor={`${fieldPrefix}-order`}>Display order</label><input className={styles.input} id={`${fieldPrefix}-order`} name="displayOrder" type="number" min="0" max="10000" defaultValue={member?.display_order ?? 0} /></div>
      <div className={styles.fieldThird}><label className={styles.label} htmlFor={`${fieldPrefix}-linkedin`}>LinkedIn URL</label><input className={styles.input} id={`${fieldPrefix}-linkedin`} name="linkedInUrl" type="url" defaultValue={member?.linkedin_url ?? ""} /></div>
      <div className={styles.fieldThird}>
        <label className={styles.label} htmlFor={`${fieldPrefix}-photo-upload`}>{member?.photo_key ? "Replace photograph" : "Upload photograph"}</label>
        <input aria-describedby={`${fieldPrefix}-photo-hint`} className={styles.input} id={`${fieldPrefix}-photo-upload`} name="photo" type="file" accept="image/jpeg,image/png,image/webp" />
        <span className={styles.hint} id={`${fieldPrefix}-photo-hint`}>Optional JPEG, PNG or WebP, up to 5 MB. Large pixel dimensions are rejected.</span>
      </div>
      <div className={styles.fieldThird}>
        <label className={styles.label} htmlFor={`${fieldPrefix}-photo-path`}>Existing same-site path</label>
        <input className={styles.input} id={`${fieldPrefix}-photo-path`} name="photoKey" defaultValue={member?.photo_key ?? ""} placeholder="Optional advanced fallback" />
        <span className={styles.hint}>Uploading a file replaces this path. Leave both blank for initials.</span>
      </div>
      <div className={styles.fieldThird}><label className={styles.label} htmlFor={`${fieldPrefix}-photo-alt`}>Photo alternative text</label><input className={styles.input} id={`${fieldPrefix}-photo-alt`} name="photoAlt" defaultValue={member?.photo_alt ?? ""} maxLength={220} /></div>
      {member?.photo_key ? (
        <div className={styles.fieldHalf}>
          <Image src={member.photo_key} alt={member.photo_alt ?? "Current team photograph"} width={96} height={96} unoptimized />
          <label className={styles.checkboxRow}><input type="checkbox" name="removePhoto" value="true" /> Remove the current photograph</label>
        </div>
      ) : null}
      {member ? <div className={styles.fieldHalf}><input type="hidden" name="updatedAt" value={member.updated_at} /><input type="hidden" name="activePresent" value="true" /><label className={styles.checkboxRow}><input type="checkbox" name="active" value="true" defaultChecked={Boolean(member.active)} /> Active on public Team page</label></div> : null}
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
        <div className={styles.panelBody}><ActionForm action="/api/admin/team" mode="form-data" submitLabel="Add team member"><MemberFields /></ActionForm></div>
      </section>
      <section className={styles.panel}>
        <div className={styles.panelHeader}><h2 className={styles.panelTitle}>Team records</h2><span className={styles.panelMeta}>{members.results.length} total</span></div>
        {members.results.length ? <div className={styles.panelBody}>{members.results.map((member) => <details key={member.id} className={styles.panel} open={false}><summary className={styles.panelHeader}><span className={styles.primaryCell}>{member.name}<span className={styles.secondaryCell}>{member.role} · {member.group_name}</span></span><StatusBadge value={member.active ? "Active" : "Inactive"} /></summary><div className={styles.panelBody}><ActionForm action={`/api/admin/team/${member.id}`} method="PATCH" mode="form-data" submitLabel="Save team member"><MemberFields member={member} /></ActionForm></div></details>)}</div> : <EmptyState title="No team records yet">Add the first team member above. A photograph is not required; the public page can show an accessible fallback.</EmptyState>}
      </section>
    </>
  );
}
