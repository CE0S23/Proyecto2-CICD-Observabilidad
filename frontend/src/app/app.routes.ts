import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth.guard';
import { LoginComponent } from './pages/login.component';
import { RegisterComponent } from './pages/register.component';
import { ShellComponent } from './pages/shell.component';
import { UserFormComponent } from './pages/user-form.component';
import { UsersListComponent } from './pages/users-list.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent, canActivate: [guestGuard], title: 'Iniciar sesion' },
  { path: 'register', component: RegisterComponent, canActivate: [guestGuard], title: 'Registro' },
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      { path: 'users', component: UsersListComponent, title: 'Usuarios' },
      { path: 'users/new', component: UserFormComponent, title: 'Nuevo usuario' },
      { path: 'users/:id/edit', component: UserFormComponent, title: 'Editar usuario' },
      { path: '', pathMatch: 'full', redirectTo: 'users' },
    ],
  },
  { path: '**', redirectTo: '' },
];
