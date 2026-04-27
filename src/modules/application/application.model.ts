import { Schema, model, Document, Types } from 'mongoose';

export type ApplicationStatus = 'pending' | 'reviewing' | 'accepted' | 'rejected' | 'withdrawn';

export interface IApplication extends Document {
  _id: Types.ObjectId;
  opportunityId: Types.ObjectId;
  applicantId: Types.ObjectId;
  status: ApplicationStatus;
  coverLetter?: string;
  resumeUrl?: string;
  notes?: string; // internal recruiter notes
  statusHistory: Array<{
    status: ApplicationStatus;
    changedAt: Date;
    changedBy: Types.ObjectId;
    reason?: string;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const applicationSchema = new Schema<IApplication>(
  {
    opportunityId: {
      type: Schema.Types.ObjectId,
      ref: 'Opportunity',
      required: true,
      index: true,
    },
    applicantId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'reviewing', 'accepted', 'rejected', 'withdrawn'],
      default: 'pending',
    },
    coverLetter: {
      type: String,
      maxlength: 3000,
    },
    resumeUrl: {
      type: String,
    },
    notes: {
      type: String,
      maxlength: 1000,
    },
    statusHistory: [
      {
        status: {
          type: String,
          enum: ['pending', 'reviewing', 'accepted', 'rejected', 'withdrawn'],
        },
        changedAt: { type: Date, default: Date.now },
        changedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        reason: { type: String },
      },
    ],
  },
  {
    timestamps: true,
  },
);

// Prevent duplicate applications — DB-level guarantee, handles race conditions
applicationSchema.index({ opportunityId: 1, applicantId: 1 }, { unique: true });
// Recruiter view: all applications for an opportunity, sorted by recency + status
applicationSchema.index({ opportunityId: 1, status: 1, createdAt: -1 });
// Applicant view: my applications sorted by recency
applicationSchema.index({ applicantId: 1, status: 1, createdAt: -1 });

export const ApplicationModel = model<IApplication>('Application', applicationSchema);
