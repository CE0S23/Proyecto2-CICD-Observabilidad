import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService, User } from '../core/auth.service';
import { apiErrorMessage } from '../core/auth.interceptor';
import { UsersService } from '../core/users.service';

@Component({
  selector: 'app-users-list',
  imports: [RouterLink, DatePipe],
  template: `
    <div class="page-head">
      <div>
        <h1>Usuarios</h1>
        <p class="muted">{{ users().length }} registrados</p>
      </div>
      <div class="actions">
        <input class="search" type="search" placeholder="Buscar por nombre o email" (input)="query.set($any($event.target).value)" data-testid="users-search" />
        <a class="btn primary" routerLink="/users/new" data-testid="users-new">Nuevo usuario</a>
      </div>
    </div>

    @if (notice()) {
      <div class="alert success" role="status" data-testid="users-notice">{{ notice() }}</div>
    }
    @if (error()) {
      <div class="alert error" role="alert" data-testid="users-error">{{ error() }}</div>
    }

    <div class="card table-wrap">
      @if (loading()) {
        <p class="muted pad">Cargando usuarios...</p>
      } @else if (filtered().length === 0) {
        <p class="muted pad" data-testid="users-empty">No hay usuarios que coincidan.</p>
      } @else {
        <table data-testid="users-table">
          <thead>
            <tr><th>ID</th><th>Nombre</th><th>Email</th><th>Rol</th><th>Creado</th><th class="right">Acciones</th></tr>
          </thead>
          <tbody>
            @for (u of filtered(); track u.id) {
              <tr [attr.data-testid]="'user-row-' + u.email">
                <td class="mono">{{ u.id }}</td>
                <td>{{ u.name }}</td>
                <td>{{ u.email }}</td>
                <td><span class="badge" [class.admin]="u.role === 'ADMIN'">{{ u.role }}</span></td>
                <td class="muted">{{ u.createdAt | date: 'dd/MM/yyyy HH:mm' }}</td>
                <td class="right nowrap">
                  @if (confirmId() === u.id) {
                    <span class="confirm">¿Eliminar?</span>
                    <button class="btn danger sm" (click)="remove(u)" data-testid="confirm-delete">Si, eliminar</button>
                    <button class="btn ghost sm" (click)="confirmId.set(null)">Cancelar</button>
                  } @else {
                    <a class="btn ghost sm" [routerLink]="['/users', u.id, 'edit']" data-testid="edit-user">Editar</a>
                    <button class="btn ghost sm danger-text" (click)="confirmId.set(u.id)" [disabled]="u.id === me()?.id" data-testid="delete-user">Eliminar</button>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      }
    </div>
  `,
})
export class UsersListComponent implements OnInit {
  private readonly api = inject(UsersService);
  readonly me = inject(AuthService).user;

  readonly users = signal<User[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly notice = signal(history.state?.notice ?? '');
  readonly query = signal('');
  readonly confirmId = signal<number | null>(null);
  readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    return q ? this.users().filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(q)) : this.users();
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.list().subscribe({
      next: (u) => {
        this.users.set(u);
        this.loading.set(false);
      },
      error: (e) => {
        this.error.set(apiErrorMessage(e, 'No se pudo cargar la lista de usuarios'));
        this.loading.set(false);
      },
    });
  }

  remove(u: User): void {
    this.api.remove(u.id).subscribe({
      next: () => {
        this.confirmId.set(null);
        this.notice.set(`Usuario ${u.email} eliminado`);
        this.users.update((list) => list.filter((x) => x.id !== u.id));
      },
      error: (e) => this.error.set(apiErrorMessage(e, 'No se pudo eliminar el usuario')),
    });
  }
}
