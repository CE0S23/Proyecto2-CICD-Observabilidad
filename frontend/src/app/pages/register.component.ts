import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { apiErrorMessage } from '../core/auth.interceptor';

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <section class="auth">
      <div class="auth-brand">
        <span class="mark">P2</span>
        <h1>Crea tu cuenta</h1>
        <p>Registrate para administrar los usuarios del sistema.</p>
      </div>
      <form class="card auth-card" [formGroup]="form" (ngSubmit)="submit()" data-testid="register-form" novalidate>
        <h2>Registro</h2>
        @if (error()) {
          <div class="alert error" role="alert" data-testid="register-error">{{ error() }}</div>
        }
        <label>
          Nombre
          <input type="text" formControlName="name" autocomplete="name" data-testid="register-name" />
          @if (form.controls.name.touched && form.controls.name.invalid) {
            <small class="field-error">El nombre debe tener al menos 2 caracteres</small>
          }
        </label>
        <label>
          Email
          <input type="email" formControlName="email" autocomplete="email" data-testid="register-email" />
          @if (form.controls.email.touched && form.controls.email.invalid) {
            <small class="field-error">Escribe un email valido</small>
          }
        </label>
        <label>
          Contrasena
          <input type="password" formControlName="password" autocomplete="new-password" data-testid="register-password" />
          @if (form.controls.password.touched && form.controls.password.invalid) {
            <small class="field-error">Minimo 8 caracteres</small>
          }
        </label>
        <button class="btn primary block" type="submit" [disabled]="loading()" data-testid="register-submit">
          {{ loading() ? 'Creando cuenta...' : 'Crear cuenta' }}
        </button>
        <p class="muted center">¿Ya tienes cuenta? <a routerLink="/login" data-testid="go-login">Inicia sesion</a></p>
      </form>
    </section>
  `,
})
export class RegisterComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly error = signal('');
  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(72)]],
  });

  submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.loading.set(true);
    this.error.set('');
    const { name, email, password } = this.form.getRawValue();
    this.auth.register(name, email, password).subscribe({
      next: () => this.router.navigateByUrl('/users'),
      error: (e) => {
        this.error.set(apiErrorMessage(e, 'No se pudo completar el registro'));
        this.loading.set(false);
      },
    });
  }
}
