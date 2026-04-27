export interface ApplicationSubmittedEvent {
  applicationId: string;
  opportunityId: string;
  applicantId: string;
  applicantEmail: string;
  opportunityTitle: string;
}

export interface ApplicationStatusUpdatedEvent {
  applicationId: string;
  opportunityId: string;
  applicantId: string;
  applicantEmail: string;
  opportunityTitle: string;
  oldStatus: string;
  newStatus: string;
}

export interface OpportunityCreatedEvent {
  opportunityId: string;
  title: string;
  tags: string[];
  location: string;
  createdBy: string;
}

export interface OpportunityUpdatedEvent {
  opportunityId: string;
  title: string;
  updatedBy: string;
  changes: Record<string, unknown>;
}

export interface UserRegisteredEvent {
  userId: string;
  email: string;
  name: string;
}

// Central map of all app events — enforces type safety across the bus
export interface AppEvents {
  'application:submitted': ApplicationSubmittedEvent;
  'application:status:updated': ApplicationStatusUpdatedEvent;
  'opportunity:created': OpportunityCreatedEvent;
  'opportunity:updated': OpportunityUpdatedEvent;
  'user:registered': UserRegisteredEvent;
}
