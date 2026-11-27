import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';

export interface User {
  id: number;
  name: string;
  email: string;
  role: 'ADMIN' | 'USER';
  createdAt: string;
  updatedAt: string;
}

interface AuthResponse {
  access_token: string;
  token_type: 'Bearer';
  user: User;
}

const TOKEN_KEY = 'p2_token';
const USER_KEY = 'p2_user';

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly tokenSig = signal<string | null>(readStorage(TOKEN_KEY));
  private readonly userSig = signal<User | null>(JSON.parse(readStorage(USER_KEY) || 'null'));

  readonly user = this.userSig.asReadonly();
  readonly isLoggedIn = computed(() => !!this.tokenSig() && !this.isExpired(this.tokenSig()!));

  get token(): string | null {
    return this.tokenSig();
  }

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>('/api/auth/login', { email, password }).pipe(tap((r) => this.store(r)));
  }

  register(name: string, email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>('/api/auth/register', { name, email, password }).pipe(tap((r) => this.store(r)));
  }

  logout(): void {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {
      /* almacenamiento no disponible */
    }
    this.tokenSig.set(null);
    this.userSig.set(null);
    this.router.navigateByUrl('/login');
  }

  private store(r: AuthResponse): void {
    try {
      localStorage.setItem(TOKEN_KEY, r.access_token);
      localStorage.setItem(USER_KEY, JSON.stringify(r.user));
    } catch {
      /* almacenamiento no disponible: la sesion vive solo en memoria */
    }
    this.tokenSig.set(r.access_token);
    this.userSig.set(r.user);
  }

  private isExpired(token: string): boolean {
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return typeof payload.exp === 'number' && payload.exp * 1000 < Date.now();
    } catch {
      return true;
    }
  }
}
