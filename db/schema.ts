import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const adminUsers = sqliteTable(
  "admin_users",
  {
    id: text("id").primaryKey(),
    externalUserId: text("external_user_id"),
    name: text("name").notNull(),
    email: text("email").notNull(),
    role: text("role", { enum: ["admin", "super_user"] })
      .notNull()
      .default("admin"),
    status: text("status", { enum: ["invited", "active", "disabled"] })
      .notNull()
      .default("invited"),
    invitationTokenHash: text("invitation_token_hash"),
    invitationExpiresAt: integer("invitation_expires_at"),
    lastLoginAt: integer("last_login_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_admin_users_email").on(table.email),
    uniqueIndex("idx_admin_users_external_id").on(table.externalUserId),
    index("idx_admin_users_status_role").on(table.status, table.role),
  ],
);

export const publications = sqliteTable(
  "publications",
  {
    id: text("id").primaryKey(),
    type: text("type", { enum: ["strategic", "legal", "markets"] }).notNull(),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    summary: text("summary").notNull().default(""),
    publicationDate: integer("publication_date").notNull(),
    status: text("status", {
      enum: [
        "uploaded",
        "parsing",
        "draft",
        "review",
        "scheduled",
        "published",
        "archived",
        "parse_failed",
      ],
    })
      .notNull()
      .default("uploaded"),
    scheduledAt: integer("scheduled_at"),
    authors: text("authors").notNull().default("[]"),
    chapter: text("chapter"),
    coverImageKey: text("cover_image_key"),
    sourcePdfKey: text("source_pdf_key"),
    webBody: text("web_body").notNull().default("[]"),
    parserVersion: text("parser_version"),
    parseWarnings: text("parse_warnings").notNull().default("[]"),
    parseError: text("parse_error"),
    structuredMetadata: text("structured_metadata").notNull().default("{}"),
    featured: integer("featured", { mode: "boolean" }).notNull().default(false),
    searchText: text("search_text").notNull().default(""),
    createdBy: text("created_by").references(() => adminUsers.id),
    updatedBy: text("updated_by").references(() => adminUsers.id),
    publishedBy: text("published_by").references(() => adminUsers.id),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    publishedAt: integer("published_at"),
  },
  (table) => [
    uniqueIndex("idx_publications_slug").on(table.slug),
    index("idx_publications_public_listing").on(
      table.status,
      table.type,
      table.publicationDate,
    ),
    index("idx_publications_scheduled").on(table.status, table.scheduledAt),
  ],
);

export const publicationRevisions = sqliteTable(
  "publication_revisions",
  {
    id: text("id").primaryKey(),
    publicationId: text("publication_id")
      .notNull()
      .references(() => publications.id),
    revisionNumber: integer("revision_number").notNull(),
    sourcePdfKey: text("source_pdf_key"),
    webBody: text("web_body").notNull(),
    parseWarnings: text("parse_warnings").notNull().default("[]"),
    note: text("note"),
    createdBy: text("created_by").references(() => adminUsers.id),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_publication_revision_number").on(
      table.publicationId,
      table.revisionNumber,
    ),
  ],
);

export const applicants = sqliteTable(
  "applicants",
  {
    id: text("id").primaryKey(),
    submissionKey: text("submission_key").notNull(),
    name: text("name").notNull(),
    university: text("university").notNull(),
    email: text("email").notNull(),
    division: text("division", { enum: ["law", "finance", "markets"] }).notNull(),
    cvKey: text("cv_key").notNull(),
    cvFilename: text("cv_filename").notNull(),
    cvSize: integer("cv_size").notNull(),
    status: text("status", {
      enum: [
        "new",
        "reviewing",
        "interview",
        "offered",
        "accepted",
        "rejected",
        "withdrawn",
      ],
    })
      .notNull()
      .default("new"),
    privacyAcknowledgedAt: integer("privacy_acknowledged_at").notNull(),
    privacyPolicyVersion: text("privacy_policy_version").notNull(),
    source: text("source"),
    campaign: text("campaign"),
    submittedAt: integer("submitted_at").notNull(),
    retentionExpiresAt: integer("retention_expires_at"),
    deletionRequestedAt: integer("deletion_requested_at"),
    deletionRequestedBy: text("deletion_requested_by").references(
      () => adminUsers.id,
    ),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_applicants_submission_key").on(table.submissionKey),
    index("idx_applicants_email").on(table.email),
    index("idx_applicants_pipeline").on(
      table.status,
      table.division,
      table.submittedAt,
    ),
    index("idx_applicants_retention").on(
      table.retentionExpiresAt,
      table.deletionRequestedAt,
    ),
  ],
);

export const rateLimits = sqliteTable(
  "rate_limits",
  {
    key: text("key").primaryKey(),
    windowStartedAt: integer("window_started_at").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => [index("idx_rate_limits_expiry").on(table.expiresAt)],
);

export const applicantNotes = sqliteTable(
  "applicant_notes",
  {
    id: text("id").primaryKey(),
    applicantId: text("applicant_id")
      .notNull()
      .references(() => applicants.id),
    body: text("body").notNull(),
    createdBy: text("created_by").references(() => adminUsers.id),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("idx_applicant_notes_applicant").on(table.applicantId)],
);

export const applicantStatusHistory = sqliteTable(
  "applicant_status_history",
  {
    id: text("id").primaryKey(),
    applicantId: text("applicant_id")
      .notNull()
      .references(() => applicants.id),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    changedBy: text("changed_by").references(() => adminUsers.id),
    changedAt: integer("changed_at").notNull(),
  },
  (table) => [index("idx_applicant_history_applicant").on(table.applicantId)],
);

export const teamMembers = sqliteTable(
  "team_members",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    role: text("role").notNull(),
    groupName: text("group_name").notNull(),
    photoKey: text("photo_key"),
    photoAlt: text("photo_alt"),
    biography: text("biography").notNull().default(""),
    linkedInUrl: text("linkedin_url"),
    displayOrder: integer("display_order").notNull().default(0),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [index("idx_team_public_order").on(table.active, table.groupName, table.displayOrder)],
);

export const contentEntries = sqliteTable(
  "content_entries",
  {
    key: text("key").primaryKey(),
    draftValue: text("draft_value").notNull().default("{}"),
    publishedValue: text("published_value").notNull().default("{}"),
    updatedBy: text("updated_by").references(() => adminUsers.id),
    updatedAt: integer("updated_at").notNull(),
    publishedAt: integer("published_at"),
  },
);

export const applicationSettings = sqliteTable("application_settings", {
  id: integer("id").primaryKey().default(1),
  open: integer("open", { mode: "boolean" }).notNull().default(false),
  introduction: text("introduction").notNull().default(""),
  closedMessage: text("closed_message").notNull().default(""),
  notificationRecipients: text("notification_recipients").notNull().default("[]"),
  privacyPolicyVersion: text("privacy_policy_version").notNull().default("2026-08-04"),
  retentionDays: integer("retention_days"),
  updatedBy: text("updated_by").references(() => adminUsers.id),
  updatedAt: integer("updated_at").notNull(),
});

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    actorId: text("actor_id").references(() => adminUsers.id),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    metadata: text("metadata").notNull().default("{}"),
    ipHash: text("ip_hash"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("idx_audit_entity").on(table.entityType, table.entityId, table.createdAt),
    index("idx_audit_actor").on(table.actorId, table.createdAt),
  ],
);

export const backgroundJobs = sqliteTable(
  "background_jobs",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    status: text("status", { enum: ["queued", "running", "succeeded", "failed"] })
      .notNull()
      .default("queued"),
    payload: text("payload").notNull().default("{}"),
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
    claimToken: text("claim_token"),
    runAfter: integer("run_after").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [index("idx_jobs_queue").on(table.status, table.runAfter)],
);

export const analyticsDaily = sqliteTable(
  "analytics_daily",
  {
    day: text("day").notNull(),
    event: text("event").notNull(),
    dimensionName: text("dimension_name").notNull(),
    dimensionValue: text("dimension_value").notNull(),
    count: integer("count").notNull().default(0),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    primaryKey({
      name: "analytics_daily_pk",
      columns: [
        table.day,
        table.event,
        table.dimensionName,
        table.dimensionValue,
      ],
    }),
    index("idx_analytics_daily_event_day").on(table.event, table.day),
  ],
);
