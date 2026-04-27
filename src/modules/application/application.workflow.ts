import { ApplicationStatus } from './application.model';
import { AppError } from '../../shared/errors/AppError';

// Defines valid status transitions
type TransitionMap = Record<ApplicationStatus, ApplicationStatus[]>;

const VALID_TRANSITIONS: TransitionMap = {
  pending: ['reviewing', 'rejected', 'withdrawn'],
  reviewing: ['accepted', 'rejected', 'withdrawn'],
  accepted: ['withdrawn'],  // accepted can only be withdrawn by applicant
  rejected: [],             // terminal state
  withdrawn: [],            // terminal state
};

// Who can perform which transitions
type RoleTransitions = Record<string, ApplicationStatus[]>;

const ROLE_ALLOWED_TRANSITIONS: Record<string, RoleTransitions> = {
  // Recruiters/admins can move to these statuses
  recruiter: {
    from_pending: ['reviewing', 'rejected'],
    from_reviewing: ['accepted', 'rejected'],
    from_accepted: [],
    from_rejected: [],
    from_withdrawn: [],
  },
  // Applicants can only withdraw
  user: {
    from_pending: ['withdrawn'],
    from_reviewing: ['withdrawn'],
    from_accepted: ['withdrawn'],
    from_rejected: [],
    from_withdrawn: [],
  },
};

export interface TransitionResult {
  valid: boolean;
  reason?: string;
}

export class ApplicationWorkflow {
  /**
   * Validates whether a status transition is allowed
   */
  canTransition(from: ApplicationStatus, to: ApplicationStatus): TransitionResult {
    const allowed = VALID_TRANSITIONS[from];
    if (!allowed.includes(to)) {
      return {
        valid: false,
        reason: `Cannot transition from "${from}" to "${to}". Allowed: [${allowed.join(', ') || 'none'}]`,
      };
    }
    return { valid: true };
  }

  /**
   * Validates whether a specific role can perform the transition
   */
  canRoleTransition(
    from: ApplicationStatus,
    to: ApplicationStatus,
    role: string,
  ): TransitionResult {
    // First check if the transition itself is valid
    const baseCheck = this.canTransition(from, to);
    if (!baseCheck.valid) return baseCheck;

    const normalizedRole = role === 'admin' ? 'recruiter' : role;
    const roleMap = ROLE_ALLOWED_TRANSITIONS[normalizedRole];

    if (!roleMap) {
      return { valid: false, reason: `Unknown role: ${role}` };
    }

    const fromKey = `from_${from}` as keyof typeof roleMap;
    const allowedForRole = roleMap[fromKey] || [];

    if (!allowedForRole.includes(to)) {
      return {
        valid: false,
        reason: `Role "${role}" cannot transition from "${from}" to "${to}"`,
      };
    }

    return { valid: true };
  }

  /**
   * Throws if the transition is invalid
   */
  assertTransition(from: ApplicationStatus, to: ApplicationStatus, role: string): void {
    const result = this.canRoleTransition(from, to, role);
    if (!result.valid) {
      throw AppError.badRequest(result.reason ?? 'Invalid status transition');
    }
  }

  /**
   * Returns all possible next states from a given status for a role
   */
  getNextStates(from: ApplicationStatus, role: string): ApplicationStatus[] {
    const normalizedRole = role === 'admin' ? 'recruiter' : role;
    const roleMap = ROLE_ALLOWED_TRANSITIONS[normalizedRole];
    if (!roleMap) return [];

    const fromKey = `from_${from}` as keyof typeof roleMap;
    return (roleMap[fromKey] as ApplicationStatus[]) || [];
  }

  isTerminalState(status: ApplicationStatus): boolean {
    return VALID_TRANSITIONS[status].length === 0;
  }
}

export const applicationWorkflow = new ApplicationWorkflow();
