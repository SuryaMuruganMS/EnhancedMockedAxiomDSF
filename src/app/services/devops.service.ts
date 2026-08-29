import { Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';

export interface DevOpsConnection {
  organization: string;
  project: string;
  pat: string;
}

export interface WorkItemResult {
  count: number;
  value: WorkItem[];
}

export interface WorkItem {
  id: number;
  rev: number;
  fields: {
    'System.Id': number;
    'System.Title': string;
    'System.State': string;
    'System.WorkItemType': string;
    'System.AssignedTo'?: { displayName: string; uniqueName: string };
    'System.Description'?: string;
    'System.CreatedDate'?: string;
    'Microsoft.VSTS.Common.Priority'?: number;
    'System.Tags'?: string;
    'System.AreaPath'?: string;
    'Microsoft.VSTS.Common.AcceptanceCriteria'?: string;
  };
  url: string;
}

export interface RepoResult {
  count: number;
  value: Repo[];
}

export interface Repo {
  id: string;
  name: string;
  defaultBranch?: string;
  size: number;
  webUrl: string;
}

export interface BranchResult {
  count: number;
  value: Branch[];
}

export interface Branch {
  name: string;
  objectId: string;
}

export interface PushFile {
  path: string;
  content: string;
}

export interface PushRequest {
  organization: string;
  project: string;
  pat: string;
  repositoryId: string;
  branchName: string;
  sourceBranch: string;
  commitMessage: string;
  files: PushFile[];
}

export interface CreateWorkItemRequest {
  organization: string;
  project: string;
  pat: string;
  workItemType: string;
  title: string;
  description?: string;
  acceptanceCriteria?: string;
  tags?: string;
  priority?: number;
  areaPath?: string;
}

export interface BatchCreateWorkItemsRequest {
  organization: string;
  project: string;
  pat: string;
  workItemType: string;
  workItems: {
    title: string;
    description?: string;
    acceptanceCriteria?: string;
    tags?: string;
    priority?: number;
  }[];
}

@Injectable({ providedIn: 'root' })
export class DevOpsService {
  private apiUrl = '/api/azure-devops';

  testConnection(conn: DevOpsConnection): Observable<any> {
    return of(null as any);
  }

  getWorkItems(conn: DevOpsConnection, workItemType: string, state?: string, top?: number): Observable<WorkItemResult> {
    return of(null as unknown as WorkItemResult);
  }

  getWorkItem(id: number, conn: DevOpsConnection): Observable<WorkItem> {
    return of(null as unknown as WorkItem);
  }

  listRepos(conn: DevOpsConnection): Observable<RepoResult> {
    return of(null as unknown as RepoResult);
  }

  listBranches(conn: DevOpsConnection, repositoryId: string): Observable<BranchResult> {
    return of(null as unknown as BranchResult);
  }

  pushCode(request: PushRequest): Observable<any> {
    return of(null as any);
  }

  createWorkItem(request: CreateWorkItemRequest): Observable<any> {
    return of(null as any);
  }

  createWorkItemsBatch(request: BatchCreateWorkItemsRequest): Observable<any> {
    return of(null as any);
  }
}
