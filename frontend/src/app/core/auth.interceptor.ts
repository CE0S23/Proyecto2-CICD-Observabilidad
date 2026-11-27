import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/** Adjunta el JWT a las peticiones /api y cierra sesion si la API responde 401. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.token;
  const isAuthCall = req.url.startsWith('/api/auth/login') || req.url.startsWith('/api/auth/register');
  const authReq = token && !isAuthCall ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
  return next(authReq).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status === 401 && !isAuthCall) auth.logout();
      return throwError(() => err);
    }),
  );
};

/** Convierte la respuesta de error de la API en un mensaje legible. */
export function apiErrorMessage(err: unknown, fallback = 'Ocurrio un error inesperado'): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) return 'No hay conexion con el servidor';
    const msg = err.error?.message;
    if (Array.isArray(msg)) return msg.join('. ');
    if (typeof msg === 'string') return msg;
    return `${fallback} (HTTP ${err.status})`;
  }
  return fallback;
}
