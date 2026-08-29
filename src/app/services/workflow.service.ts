import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { MockApi, LINE } from '../mock/mock-api';
import { Mode } from '../mock/render';

export interface StartWorkflowRequest {
  workspaceId: number;
  requirementText: string;
  pipelineMode?: string;
}

export interface Workflow {
  id: number;
  workspaceId: number;
  requirementId?: number;
  agentName: string;
  sequenceNumber: number;
  state: string;
  createdAt?: string;
  updatedAt?: string;
  comments?: string;
  storyId?: string;
}

export interface WorkflowApprovalRequest {
  workspaceId: number;
  requirementId: number;
  agentNumber: number;
  decision: 'APPROVE' | 'REWORK' | 'REJECT';
  comments?: string;
}

export interface WorkflowRevertRequest {
  workspaceId: number;
  requirementId: number;
  agentNumber: number;
}

/**
 * Workflow API — mock build.
 *
 * A run advances on MockApi's timer: a stage sits IN_PROGRESS for a few
 * seconds, lands IN_REVIEW, and approving it starts the next one. That is what
 * makes the console worth looking at.
 */
@Injectable({ providedIn: 'root' })
export class WorkflowService {
  private api = inject(MockApi);

  startWorkflow(request: StartWorkflowRequest): Observable<Workflow> {
    return this.api.startWorkflow(
      request.workspaceId, request.requirementText, request.pipelineMode as Mode,
    ) as Observable<Workflow>;
  }

  getWorkflowStatus(workspaceId: number, _requirementId: number): Observable<Workflow> {
    const rows = this.api.flows().filter(f => f.workspaceId === workspaceId);
    return of(rows[rows.length - 1] as Workflow);
  }

  getAllWorkflows(): Observable<Workflow[]> {
    return this.api.allWorkflows() as Observable<Workflow[]>;
  }

  approveWorkflow(request: WorkflowApprovalRequest): Observable<Workflow> {
    return this.api.approve(
      request.workspaceId, request.agentNumber, request.decision, request.comments ?? '',
    ) as Observable<Workflow>;
  }

  revertWorkflow(request: WorkflowRevertRequest): Observable<Workflow> {
    return this.api.approve(request.workspaceId, request.agentNumber, 'REWORK', 'Reverted') as Observable<Workflow>;
  }

  getAgentOutput(agentNumber: number, workspaceId: number, _requirementId: number, _userStoryId?: number): Observable<any> {
    return this.api.agentOutput(agentNumber, workspaceId);
  }

  getAgentPipelineConfig(): Observable<any[]> {
    return of(LINE.map(l => ({
      agentName: l.a, agentType: l.k, executionOrder: l.n, enabled: true,
    })));
  }

  getWorkflowsByUserStory(_userStoryId: number): Observable<Workflow[]> {
    return this.api.allWorkflows() as Observable<Workflow[]>;
  }

  getWorkflowsByContext(workspaceId: number, _requirementId: number, _userStoryId?: number): Observable<Workflow[]> {
    return of(this.api.flows().filter(f => f.workspaceId === workspaceId) as Workflow[]);
  }
}
