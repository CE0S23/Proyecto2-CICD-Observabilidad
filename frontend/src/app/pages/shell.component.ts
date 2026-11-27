import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';

/** Layout de las paginas privadas: barra superior con usuario actual y cierre de sesion. */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header class="topbar">
      <a class="brand" routerLink="/users"><span class="mark sm">P2</span> Proyecto Parcial 2</a>
      <nav>
        <a routerLink="/users" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Usuarios</a>
      </nav>
      <div class="who">
        <span data-testid="current-user">{{ auth.user()?.name }}</span>
        <button class="btn ghost sm" (click)="auth.logout()" data-testid="logout">Cerrar sesion</button>
      </div>
    </header>
    <main class="container">
      <router-outlet />
    </main>
  `,
})
export class ShellComponent {
  readonly auth = inject(AuthService);
}
