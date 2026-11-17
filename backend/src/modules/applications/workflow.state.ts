import { WorkflowState } from '../../shared/types';
import { AppError } from '../../shared/errors';

export class WorkflowStateMachine {
  /**
   * Explicit valid state transitions map
   */
  private static readonly transitions: Record<WorkflowState, WorkflowState[]> = {
    REQUESTED: ['SERVICE_IDENTIFIED', 'CANCELLED', 'FAILED'],
    SERVICE_IDENTIFIED: ['POLICY_RETRIEVED', 'ELIGIBILITY_PENDING', 'CANCELLED', 'FAILED'],
    POLICY_RETRIEVED: ['ELIGIBILITY_PENDING', 'ELIGIBILITY_COMPLETED', 'CANCELLED', 'FAILED'],
    ELIGIBILITY_PENDING: ['ELIGIBILITY_COMPLETED', 'CANCELLED', 'FAILED'],
    ELIGIBILITY_COMPLETED: ['DOCUMENTS_PENDING', 'DOCUMENTS_READY', 'CANCELLED', 'FAILED'],
    DOCUMENTS_PENDING: ['ELIGIBILITY_PENDING', 'DOCUMENTS_READY', 'CANCELLED', 'FAILED'],
    DOCUMENTS_READY: ['APPLICATION_PREPARED', 'CANCELLED', 'FAILED'],
    APPLICATION_PREPARED: ['APPROVAL_PENDING', 'CANCELLED', 'FAILED'],
    APPROVAL_PENDING: ['BROWSER_EXECUTION_PENDING', 'CANCELLED', 'FAILED'],
    BROWSER_EXECUTION_PENDING: ['FORM_FILLED', 'FAILED', 'CANCELLED'],
    FORM_FILLED: ['FINAL_APPROVAL_PENDING', 'FAILED', 'CANCELLED'],
    FINAL_APPROVAL_PENDING: ['SUBMISSION_COMPLETED', 'CANCELLED', 'FAILED'],
    SUBMISSION_COMPLETED: [], // Terminal success
    FAILED: ['REQUESTED'], // Allow retry from start
    CANCELLED: ['REQUESTED'], // Allow re-initiating
  };

  /**
   * Validates if transition from currentState to nextState is permitted.
   * Throws AppError.badRequest if transition is invalid.
   */
  public static validateTransition(current: WorkflowState, next: WorkflowState): void {
    const allowed = this.transitions[current] || [];
    if (!allowed.includes(next)) {
      throw AppError.badRequest(
        `Invalid workflow state transition: Cannot transition from '${current}' to '${next}'. Allowed next states: [${allowed.join(', ')}]`
      );
    }
  }

  public static canTransition(current: WorkflowState, next: WorkflowState): boolean {
    const allowed = this.transitions[current] || [];
    return allowed.includes(next);
  }
}
