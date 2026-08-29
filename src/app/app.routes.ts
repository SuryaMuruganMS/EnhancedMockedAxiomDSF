import { Routes } from '@angular/router';
import { ConsolePage } from './pages/console';
import { SpacesPage } from './pages/spaces';
import { SpacePage } from './pages/space';
import { AgentsPage } from './pages/agents';
import { NewRunPage } from './pages/newrun';
import { RunsPage } from './pages/runs';
import { DevOpsPage } from './pages/devops';

/**
 * Every route is eager in this build.
 *
 * The production app lazy-loads each page, which is right when it is served
 * over HTTP. This demo is designed to run as a single self-contained file, and
 * a lazy chunk is a network request for a URL that will not exist there. Eager
 * imports put every page into one bundle — a larger first load in exchange for
 * a build that runs from anywhere, including a file:// URL.
 */
export const routes: Routes = [
  { path: '', redirectTo: 'console', pathMatch: 'full' },
  { path: 'console', component: ConsolePage },

  { path: 'workspaces',     component: SpacesPage },
  { path: 'workspaces/:id', component: SpacePage },
  { path: 'agents',         component: AgentsPage },
  { path: 'run',            component: NewRunPage },
  { path: 'runs',           component: RunsPage },
  { path: 'devops',         component: DevOpsPage },

  // Bookmarks from earlier revisions of this app.
  { path: 'dashboard',         redirectTo: 'console' },
  { path: 'about',             redirectTo: 'console' },
  { path: 'workspaces/create', redirectTo: 'workspaces' },

  { path: '**', redirectTo: 'console' },
];
