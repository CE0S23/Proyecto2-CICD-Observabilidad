import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { User } from './auth.service';

export interface UserInput {
  name: string;
  email: string;
  password?: string;
  role: 'ADMIN' | 'USER';
}

@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/users';

  list(): Observable<User[]> {
    return this.http.get<User[]>(this.base);
  }

  get(id: number): Observable<User> {
    return this.http.get<User>(`${this.base}/${id}`);
  }

  create(input: UserInput): Observable<User> {
    return this.http.post<User>(this.base, input);
  }

  update(id: number, input: Partial<UserInput>): Observable<User> {
    return this.http.patch<User>(`${this.base}/${id}`, input);
  }

  remove(id: number): Observable<{ deleted: true; id: number }> {
    return this.http.delete<{ deleted: true; id: number }>(`${this.base}/${id}`);
  }
}
