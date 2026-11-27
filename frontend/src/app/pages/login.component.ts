import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { apiErrorMessage } from '../core/auth.interceptor';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <section class="auth">
      <div class="auth-brand">
        <span class="mark">P2</span>
        <h1>Panel de usuarios</h1>
        <p>CI/CD · Pruebas automatizadas · Observabilidad</p>
      </div>
      <form class="card auth-card" [formGroup]="form" (ngSubmit)="submit()" data-testid="login-form" novalidate>
        <h2>Iniciar sesion</h2>
        @if (error()) {
          <div class="alert error" role="alert" data-testid="login-error">{{ error() }}</div>
        }
        <label>
          Email
          <input type="email" formControlName="email" autocomplete="username" data-testid="login-email" />
          @if (form.controls.email.touched && form.controls.email.invalid) {
            <small class="field-error">Escribe un email valido</small>
          }
        </label>
        <label>
          Contrasena
          <input type="password" formControlName="password" autocomplete="current-password" data-testid="login-password" />
          @if (form.controls.password.touched && form.controls.password.invalid) {
            <small class="field-error">La contrasena es obligatoria</small>
          }
        </label>
        <button class="btn primary block" type="submit" [disabled]="loading()" data-testid="login-submit">
          {{ loading() ? 'Entrando...' : 'Entrar' }}
        </button>
        <p class="muted center">¿No tienes cuenta? <a routerLink="/register" data-testid="go-register">Registrate</a></p>
      </form>
    </section>
  `,
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly loading = signal(false);
  readonly error = signal('');
  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.loading.set(true);
    this.error.set('');
    const { email, password } = this.form.getRawValue();
    this.auth.login(email, password).subscribe({
      next: () => this.router.navigateByUrl(this.route.snapshot.queryParamMap.get('returnUrl') || '/users'),
      error: (e) => {
        this.error.set(apiErrorMessage(e, 'No se pudo iniciar sesion'));
        this.loading.set(false);
      },
    });
  }
}
