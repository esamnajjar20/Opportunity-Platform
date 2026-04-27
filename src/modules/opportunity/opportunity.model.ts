import { Schema, model, Document, Types } from 'mongoose';

export type OpportunityType = 'job' | 'internship' | 'volunteer' | 'freelance' | 'contract';
export type OpportunityStatus = 'draft' | 'active' | 'closed' | 'archived';

export interface IOpportunity extends Document {
  _id: Types.ObjectId;
  title: string;
  description: string;
  type: OpportunityType;
  status: OpportunityStatus;
  location: string;
  isRemote: boolean;
  tags: string[];
  requirements: string[];
  salary?: {
    min: number;
    max: number;
    currency: string;
  };
  deadline?: Date;
  createdBy: Types.ObjectId;
  applicantsCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const opportunitySchema = new Schema<IOpportunity>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 5,
      maxlength: 200,
    },
    description: {
      type: String,
      required: true,
      minlength: 20,
      maxlength: 5000,
    },
    type: {
      type: String,
      enum: ['job', 'internship', 'volunteer', 'freelance', 'contract'],
      required: true,
    },
    status: {
      type: String,
      enum: ['draft', 'active', 'closed', 'archived'],
      default: 'active',
    },
    location: {
      type: String,
      required: true,
      trim: true,
    },
    isRemote: {
      type: Boolean,
      default: false,
    },
    tags: {
      type: [String],
      default: [],
      index: true,
    },
    requirements: {
      type: [String],
      default: [],
    },
    salary: {
      min: { type: Number },
      max: { type: Number },
      currency: { type: String, default: 'USD' },
    },
    deadline: {
      type: Date,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    applicantsCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

// Full-text search index
opportunitySchema.index(
  { title: 'text', description: 'text', tags: 'text' },
  { weights: { title: 10, tags: 5, description: 1 } },
);

// Compound indexes for common queries
opportunitySchema.index({ status: 1, createdAt: -1 });
opportunitySchema.index({ type: 1, status: 1 });
opportunitySchema.index({ location: 1, status: 1 });
opportunitySchema.index({ tags: 1, status: 1 });
// Recruiter's own listings sorted by date
opportunitySchema.index({ createdBy: 1, createdAt: -1 });
// Deadline-based filtering (upcoming deadlines)
opportunitySchema.index({ status: 1, deadline: 1 });
// Remote opportunities sorted by applicant count (popular remote jobs)
opportunitySchema.index({ isRemote: 1, status: 1, applicantsCount: -1 });

export const OpportunityModel = model<IOpportunity>('Opportunity', opportunitySchema);
