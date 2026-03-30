import { Controller, Get, Post, Body } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/types/security.types';
import { CreateUserDto } from './dto/create-user.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly auditService: AuditService,
  ) {}

  @Get('me')
  async me(@CurrentUser() user: { userId: string }) {
    const profile = await this.usersService.findById(user.userId);
    await this.auditService.logUserAction('users.me', user.userId);
    return profile;
  }

  @Roles(Role.admin)
  @Get()
  async list(@CurrentUser() user: { userId: string }) {
    await this.auditService.logUserAction('users.list', user.userId);
    return this.usersService.findAll();
  }

  @Roles(Role.admin)
  @Post()
  async create(
    @Body() dto: CreateUserDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.usersService.createByAdmin(dto, user.userId);
  }
}
