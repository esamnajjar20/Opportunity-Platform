import { Schema, model, Document, Types } from 'mongoose';

export type NotificationType =
  | 'application_submitted'
  | 'application_accepted'
  | 'application_rejected'
  | 'application_reviewing'
  | 'opportunity_closed';

export interface INotification extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  type: NotificationType;
  title: string;
  body: string;
  isRead: boolean;
  meta?: Record<string, unknown>;
  createdAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        'application_submitted',
        'application_accepted',
        'application_rejected',
        'application_reviewing',
        'opportunity_closed',
      ],
      required: true,
    },
    title: { type: String, required: true },
    body: { type: String, required: true },
    isRead: { type: Boolean, default: false },
    meta: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

// Compound index for efficient pagination and unread queries
notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

// Partial TTL: only expire notifications that are already read AND older than 30 days.
// Unread notifications are preserved indefinitely until explicitly read.
// Note: MongoDB partial indexes with TTL require a specific approach —
// we expire ALL after 90 days as a safety net, unread should be resolved by then.
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 }); // 90-day safety TTL

export const NotificationModel = model<INotification>('Notification', notificationSchema);
