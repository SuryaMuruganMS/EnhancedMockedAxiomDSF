import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { MockApi, MockWorkspace } from '../mock/mock-api';

export interface Workspace {
  id?: number;
  projectName: string;
  description?: string;
  techStack?: string;
  pipelineMode?: string;
  /** Which catalogue brief this workspace runs. Mock build only. */
  briefId?: string;
  status?: boolean;
  location?: string;
  createdAt?: string;
}

/**
 * Workspace API — mock build.
 *
 * Same surface as the HTTP service it replaces, so no page needed changing.
 * Every call is served from MockApi's in-memory state.
 */
@Injectable({ providedIn: 'root' })
export class WorkspaceService {
  private api = inject(MockApi);

  listWorkspaces(): Observable<Workspace[]> {
    return this.api.listWorkspaces() as Observable<Workspace[]>;
  }
  getWorkspaceById(id: number): Observable<Workspace> {
    return this.api.getWorkspace(id) as Observable<Workspace>;
  }
  createWorkspace(workspace: Workspace): Observable<Workspace> {
    return this.api.createWorkspace(workspace as Partial<MockWorkspace>) as Observable<Workspace>;
  }
  updateWorkspace(id: number, workspace: Partial<Workspace>): Observable<Workspace> {
    return this.api.createWorkspace({ ...workspace, id } as Partial<MockWorkspace>) as Observable<Workspace>;
  }
  deleteWorkspace(id: number): Observable<any> {
    return this.api.deleteWorkspace(id);
  }
  getWorkspaceByName(name: string): Observable<Workspace> {
    const found = this.api.spaces().find(w => w.projectName === name);
    return this.api.getWorkspace(found?.id ?? -1) as Observable<Workspace>;
  }
}
