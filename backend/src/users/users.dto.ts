import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const lower = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);

export const ROLES = ['ADMIN', 'USER'] as const;
export type RoleName = (typeof ROLES)[number];

/** POST /api/users y PUT /api/users/:id (reemplazo completo; password opcional en PUT). */
export class CreateUserDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(100)
  name!: string;

  @Transform(lower)
  @IsEmail({}, { message: 'El email no es valido' })
  @MaxLength(150)
  email!: string;

  @IsString()
  @MinLength(8, { message: 'La contrasena debe tener al menos 8 caracteres' })
  @MaxLength(72)
  password!: string;

  @IsOptional()
  @IsIn(ROLES, { message: 'El rol debe ser ADMIN o USER' })
  role?: RoleName;
}

export class ReplaceUserDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(100)
  name!: string;

  @Transform(lower)
  @IsEmail({}, { message: 'El email no es valido' })
  @MaxLength(150)
  email!: string;

  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'La contrasena debe tener al menos 8 caracteres' })
  @MaxLength(72)
  password?: string;

  @IsOptional()
  @IsIn(ROLES, { message: 'El rol debe ser ADMIN o USER' })
  role?: RoleName;
}

/** PATCH /api/users/:id (actualizacion parcial). */
export class UpdateUserDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @Transform(lower)
  @IsEmail({}, { message: 'El email no es valido' })
  @MaxLength(150)
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'La contrasena debe tener al menos 8 caracteres' })
  @MaxLength(72)
  password?: string;

  @IsOptional()
  @IsIn(ROLES, { message: 'El rol debe ser ADMIN o USER' })
  role?: RoleName;
}
