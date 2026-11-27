import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { apiErrorMessage } from '../core/auth.interceptor';
import { UserInput, UsersService } from '../core/users.service';

@Component({
  selector: 'app-user-form',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="page-head">
      <div>
        <a routerLink="/users" class="back">← Usuarios</a>
        <h1>{{ id ? 'Editar usuario' : 'Nuevo usuario' }}</h1>
      </div>
    </div>
    <form class="card form-card" [formGroup]="form" (ngSubmit)="submit()" data-testid="user-form" novalidate>
      @if (error()) {
        <div class="alert error" role="alert" data-testid="user-form-error">{{ error() }}</div>
      }
      <div class="grid">
        <label>
          Nombre
          <input type="text" formControlName="name" data-testid="user-name" />
          @if (form.controls.name.touched && form.controls.name.invalid) {
            <small class="field-error">Minimo 2 caracteres</small>
          }
        </label>
        <label>
          Email
          <input type="email" formControlName="email" data-testid="user-email" />
          @if (form.controls.email.touched && form.controls.email.invalid) {
            <small class="field-error">Escribe un email valido</small>
          }
        </label>
        <label>
          Contrasena {{ id ? '(dejar vacia para no cambiarla)' : '' }}
          <input type="password" formControlName="password" autocomplete="new-password" data-testid="user-password" />
          @if (form.controls.password.touched && form.controls.password.invalid) {
            <small class="field-error">Minimo 8 caracteres</small>
          }
        </label>
        <label>
          Rol
          <select formControlName="role" data-testid="user-role">
            <option value="USER">USER</option>
            <option value="ADMIN">ADMIN</option>
          </select>
        </label>
      </div>
      <div class="form-actions">
        <a class="btn ghost" routerLink="/users">Cancelar</a>
        <button class="btn primary" type="submit" [disabled]="saving()" data-testid="user-save">
          {{ saving() ? 'Guardando...' : id ? 'Guardar cambios' : 'Crear usuario' }}
        </button>
      </div>
    </form>
  `,
})
export class UserFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(UsersService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly id = Number(this.route.snapshot.paramMap.get('id')) || null;
  readonly saving = signal(false);
  readonly error = signal('');
  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', this.id ? [Validators.minLength(8), Validators.maxLength(72)] : [Validators.required, Validators.minLength(8), Validators.maxLength(72)]],
    role: ['USER' as 'USER' | 'ADMIN'],
  });

  ngOnInit(): void {
    if (!this.id) return;
    this.api.get(this.id).subscribe({
      next: (u) => this.form.patchValue({ name: u.name, email: u.email, role: u.role }),
      error: (e) => this.error.set(apiErrorMessage(e, 'No se pudo cargar el usuario')),
    });
  }

  submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.saving.set(true);
    this.error.set('');
    const raw = this.form.getRawValue();
    const input: UserInput = { name: raw.name, email: raw.email, role: raw.role };
    if (raw.password) input.password = raw.password;
    const req = this.id ? this.api.update(this.id, input) : this.api.create(input);
    req.subscribe({
      next: (u) =>
        this.router.navigateByUrl('/users', {
          state: { notice: this.id ? `Usuario ${u.email} actualizado` : `Usuario ${u.email} creado` },
        }),
      error: (e) => {
        this.error.set(apiErrorMessage(e, 'No se pudo guardar el usuario'));
        this.saving.set(false);
      },
    });
  }
}
