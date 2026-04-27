/**
 * Plain FilterQuery type — no mongoose dependency.
 * Used by OpportunitySearch and IOpportunityRepository so neither needs to import mongoose.
 */
export type FilterQuery = Record<string, unknown>;
