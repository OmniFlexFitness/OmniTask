import 'zone.js';
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

document.documentElement.classList.add('dark');
document.body.classList.add('bg-omni-night');

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
