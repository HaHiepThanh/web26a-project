import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { OfflineOverlay } from './components/offline-overlay/offline-overlay';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, OfflineOverlay],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('frontend');
}
