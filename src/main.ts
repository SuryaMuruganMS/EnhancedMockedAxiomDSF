import { bootstrapApplication } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideRouter, withInMemoryScrolling, withHashLocation } from '@angular/router';
import { AppShell } from './app/shell';
import { routes } from './app/app.routes';

/**
 * Mock build — no HttpClient.
 *
 * Every service is served by MockApi from in-memory state, so there is no
 * backend, no Claude CLI and no API key anywhere in this bundle.
 *
 * withHashLocation() is deliberate: this build is designed to be dropped onto
 * any static host, including ones with no SPA rewrite rule. Hash routing means
 * a deep link like /#/workspaces/1 is served by index.html everywhere, with no
 * server configuration at all.
 */
bootstrapApplication(AppShell, {
  providers: [
    provideRouter(
      routes,
      withHashLocation(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top' }),
    ),
    provideAnimations(),
  ],
}).catch(err => console.error(err));
