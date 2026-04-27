/**
 * Shared domain types — framework-agnostic plain interfaces.
 *
 * Services and repository interfaces depend on THESE, not on Mongoose Documents.
 * Mongoose models implement these via the Mongoose Document extension, so no
 * casting is required inside the repositories.
 *
 * Rule: nothing in this file imports from mongoose, express, or any ORM.
 */

// ─── Common ──────────────────────────────────────────────────────────────────

export interface BaseEntity {
  id: string;        // always a plain string — never a Mongoose ObjectId in service layer
  createdAt: Date;
  updatedAt: Date;
}

// ─── User ────────────────────────────────────────────────────────────────────

export type UserRole = 'user' | 'recruiter' | 'admin';

export interface UserEntity extends BaseEntity {
  name: string;
  email: string;
  password: string; // hashed — only exposed to auth layer, never serialised to clients
  role: UserRole;
  bio?: string;
  location?: string;
  tags: string[];
  avatarUrl?: string;
  isActive: boolean;
}

export type PublicUser = Omit<UserEntity, 'password'>;

// ─── Refresh Token ───────────────────────────────────────────────────────────

export interface RefreshTokenEntity {
  id: string;
  tokenHash: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
}

// ─── Opportunity ─────────────────────────────────────────────────────────────

export type OpportunityType = 'job' | 'internship' | 'volunteer' | 'freelance' | 'contract';
export type OpportunityStatus = 'draft' | 'active' | 'closed' | 'archived';

export interface OpportunityEntity extends BaseEntity {
  title: string;
  description: string;
  type: OpportunityType;
  status: OpportunityStatus;
  location: string;
  isRemote: boolean;
  tags: string[];
  requirements: string[];
  salary?: { min: number; max: number; currency: string };
  deadline?: Date;
  createdBy: string;       // plain string userId in service layer
  applicantsCount: number;
}

// ─── Application ─────────────────────────────────────────────────────────────

export type ApplicationStatus = 'pending' | 'reviewing' | 'accepted' | 'rejected' | 'withdrawn';

export interface ApplicationStatusHistoryEntry {
  status: ApplicationStatus;
  changedAt: Date;
  changedBy: string;
  reason?: string;
}

export interface ApplicationEntity extends BaseEntity {
  opportunityId: string;
  applicantId: string;
  status: ApplicationStatus;
  coverLetter?: string;
  resumeUrl?: string;
  notes?: string;
  statusHistory: ApplicationStatusHistoryEntry[];
}

// ─── Notification ────────────────────────────────────────────────────────────

export type NotificationType =
  | 'application_submitted'
  | 'application_accepted'
  | 'application_rejected'
  | 'application_reviewing'
  | 'opportunity_closed';

export interface NotificationEntity extends BaseEntity {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  isRead: boolean;
  meta?: Record<string, unknown>;
}
