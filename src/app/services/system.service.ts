import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { MockApi } from '../mock/mock-api';
import { byId } from '../mock/catalog';

export interface SystemHealth {
  status: string;
  timestamp: string;
  uptime: string;
  uptimeMs: number;
  memory: { totalMB: number; freeMB: number; usedMB: number; maxMB: number };
  stats: {
    workspaces: number; totalWorkflows: number; activeWorkflows: number;
    completedWorkflows: number; configuredAgents: number;
  };
  jvm: { version: string; vendor: string; os: string };
}

export interface UserStory {
  id: number;
  storyId: string;
  title: string;
  workspaceId: number;
  points?: number;
}

/** System API — mock build. Health is synthetic but moves, so gauges live. */
@Injectable({ providedIn: 'root' })
export class SystemService {
  private api = inject(MockApi);

  getHealth(): Observable<SystemHealth> {
    return this.api.health() as Observable<SystemHealth>;
  }

  getUserStoriesByWorkspace(workspaceId: number): Observable<UserStory[]> {
    const ws = this.api.spaces().find(w => w.id === workspaceId);
    if (!ws) return of([]);
    return of(byId(ws.briefId).stories.map((s, i) => ({
      id: i + 1, storyId: s.id, title: s.title, workspaceId, points: s.points,
    })));
  }

  getUserStoriesByRequirement(_requirementId: number): Observable<UserStory[]> {
    return of([]);
  }
}
