import { test, describe } from 'node:test';
import assert from 'node:assert';
import { WorkflowStateMachine } from '../modules/applications/workflow.state';

describe('Workflow State Machine & Approval Checkpoints Test Suite', () => {
  test('Permits forward transition: REQUESTED -> SERVICE_IDENTIFIED', () => {
    assert.doesNotThrow(() => {
      WorkflowStateMachine.validateTransition('REQUESTED', 'SERVICE_IDENTIFIED');
    });
  });

  test('Permits forward transition: APPLICATION_PREPARED -> APPROVAL_PENDING', () => {
    assert.doesNotThrow(() => {
      WorkflowStateMachine.validateTransition('APPLICATION_PREPARED', 'APPROVAL_PENDING');
    });
  });

  test('Permits forward transition: FORM_FILLED -> FINAL_APPROVAL_PENDING', () => {
    assert.doesNotThrow(() => {
      WorkflowStateMachine.validateTransition('FORM_FILLED', 'FINAL_APPROVAL_PENDING');
    });
  });

  test('Permits Checkpoint 2 transition: FINAL_APPROVAL_PENDING -> SUBMISSION_COMPLETED', () => {
    assert.doesNotThrow(() => {
      WorkflowStateMachine.validateTransition('FINAL_APPROVAL_PENDING', 'SUBMISSION_COMPLETED');
    });
  });

  test('Rejects invalid skipping: REQUESTED -> SUBMISSION_COMPLETED without human authorization', () => {
    assert.throws(
      () => {
        WorkflowStateMachine.validateTransition('REQUESTED', 'SUBMISSION_COMPLETED');
      },
      {
        message: /Invalid workflow state transition/,
      }
    );
  });

  test('Rejects illegal backward transition: SUBMISSION_COMPLETED -> FORM_FILLED', () => {
    assert.throws(
      () => {
        WorkflowStateMachine.validateTransition('SUBMISSION_COMPLETED', 'FORM_FILLED');
      },
      {
        message: /Invalid workflow state transition/,
      }
    );
  });
});
