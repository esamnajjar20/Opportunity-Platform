import '../setup';
import { ApplicationWorkflow } from '../../src/modules/application/application.workflow';
import { AppError } from '../../src/shared/errors/AppError';

describe('ApplicationWorkflow', () => {
  let workflow: ApplicationWorkflow;

  beforeEach(() => { workflow = new ApplicationWorkflow(); });

  describe('canTransition', () => {
    it('allows pending → reviewing', () => expect(workflow.canTransition('pending', 'reviewing').valid).toBe(true));
    it('allows pending → rejected', () => expect(workflow.canTransition('pending', 'rejected').valid).toBe(true));
    it('allows reviewing → accepted', () => expect(workflow.canTransition('reviewing', 'accepted').valid).toBe(true));
    it('denies rejected → accepted (terminal)', () => expect(workflow.canTransition('rejected', 'accepted').valid).toBe(false));
    it('denies withdrawn → pending (terminal)', () => expect(workflow.canTransition('withdrawn', 'pending').valid).toBe(false));
    it('denies accepted → reviewing', () => expect(workflow.canTransition('accepted', 'reviewing').valid).toBe(false));
  });

  describe('canRoleTransition', () => {
    it('allows recruiter: pending → reviewing', () => expect(workflow.canRoleTransition('pending', 'reviewing', 'recruiter').valid).toBe(true));
    it('allows recruiter: reviewing → accepted', () => expect(workflow.canRoleTransition('reviewing', 'accepted', 'recruiter').valid).toBe(true));
    it('denies user from accepting their own application', () => expect(workflow.canRoleTransition('reviewing', 'accepted', 'user').valid).toBe(false));
    it('allows user to withdraw pending application', () => expect(workflow.canRoleTransition('pending', 'withdrawn', 'user').valid).toBe(true));
    it('allows user to withdraw accepted application', () => expect(workflow.canRoleTransition('accepted', 'withdrawn', 'user').valid).toBe(true));
    it('treats admin same as recruiter', () => expect(workflow.canRoleTransition('pending', 'reviewing', 'admin').valid).toBe(true));
  });

  describe('assertTransition', () => {
    it('throws AppError on invalid transition', () => {
      expect(() => workflow.assertTransition('rejected', 'accepted', 'recruiter')).toThrow(AppError);
    });
    it('does not throw on valid transition', () => {
      expect(() => workflow.assertTransition('pending', 'reviewing', 'recruiter')).not.toThrow();
    });
  });

  describe('isTerminalState', () => {
    it('identifies rejected as terminal', () => expect(workflow.isTerminalState('rejected')).toBe(true));
    it('identifies withdrawn as terminal', () => expect(workflow.isTerminalState('withdrawn')).toBe(true));
    it('identifies pending as non-terminal', () => expect(workflow.isTerminalState('pending')).toBe(false));
    it('identifies accepted as non-terminal', () => expect(workflow.isTerminalState('accepted')).toBe(false));
  });

  describe('getNextStates', () => {
    it('returns recruiter states from pending', () => {
      const states = workflow.getNextStates('pending', 'recruiter');
      expect(states).toContain('reviewing');
      expect(states).toContain('rejected');
      expect(states).not.toContain('accepted');
    });
    it('returns user states from pending', () => {
      expect(workflow.getNextStates('pending', 'user')).toEqual(['withdrawn']);
    });
    it('returns empty array from terminal state', () => {
      expect(workflow.getNextStates('rejected', 'recruiter')).toEqual([]);
    });
  });
});
