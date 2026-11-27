import { InternalServerErrorException, Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateUserDto, ReplaceUserDto, UpdateUserDto } from './users.dto';
import { UsersService } from './users.service';

/** CRUD de usuarios, protegido con JWT (Authorization: Bearer <token>). */
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  findAll() {
    // DEMO-FAIL-HOOK: scripts/demo.sh reemplaza la siguiente linea por un error 500 intencional
    throw new InternalServerErrorException('DEMO: error intencional en GET /api/users');
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.users.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Put(':id')
  replace(@Param('id', ParseIntPipe) id: number, @Body() dto: ReplaceUserDto) {
    return this.users.replace(id, dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserDto) {
    return this.users.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.users.remove(id);
  }
}
