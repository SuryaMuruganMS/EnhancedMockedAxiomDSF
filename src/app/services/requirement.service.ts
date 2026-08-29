import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { MockApi } from '../mock/mock-api';
import { byId } from '../mock/catalog';

export interface Requirement {
  id: number;
  workspaceId: number;
  requirementText: string;
  createdAt?: string;
}

/** Requirement API — mock build. Text comes from the workspace's brief. */
@Injectable({ providedIn: 'root' })
export class RequirementService {
  private api = inject(MockApi);

  getByWorkspace(workspaceId: number): Observable<Requirement[]> {
    const ws = this.api.spaces().find(w => w.id === workspaceId);
    if (!ws) return of([]);
    return of([{
      id: 1, workspaceId,
      requirementText: byId(ws.briefId).requirement,
      createdAt: ws.createdAt,
    }]);
  }

  create(workspaceId: number, requirementText: string): Observable<Requirement> {
    return of({ id: 1, workspaceId, requirementText, createdAt: new Date().toISOString() });
  }
}
