import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/types/security.types';
import { AdminService } from './admin.service';
import { AuditService } from '../audit/audit.service';

@Controller('admin')
@Roles(Role.admin)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly auditService: AuditService,
  ) {}

  @Get('dashboard')
  async dashboard(@CurrentUser() user: { userId: string }) {
    await this.auditService.logUserAction('admin.dashboard.view', user.userId);
    return this.adminService.getDashboard();
  }
}
