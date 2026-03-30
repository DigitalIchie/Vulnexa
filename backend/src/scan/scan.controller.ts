import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/types/security.types';
import { CreateScanDto } from './dto/create-scan.dto';
import { ScanService } from './scan.service';

@Controller('scans')
export class ScanController {
  constructor(private readonly scanService: ScanService) {}

  @Roles(Role.admin, Role.tester)
  @Post()
  triggerScan(
    @Body() dto: CreateScanDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.scanService.createScan(dto, user.userId);
  }

  @Roles(Role.admin, Role.tester)
  @Get()
  getScans(@CurrentUser() user: { userId: string; role: Role }) {
    return this.scanService.listScans(user.userId, user.role);
  }

  @Roles(Role.admin, Role.tester)
  @Get(':scanId')
  getScan(
    @Param('scanId') scanId: string,
    @CurrentUser() user: { userId: string; role: Role },
  ) {
    return this.scanService.getScanById(scanId, user.userId, user.role);
  }

  @Roles(Role.admin, Role.tester)
  @Get(':scanId/findings')
  getFindings(
    @Param('scanId') scanId: string,
    @CurrentUser() user: { userId: string; role: Role },
  ) {
    return this.scanService.getFindings(scanId, user.userId, user.role);
  }

  @Roles(Role.admin, Role.tester)
  @Get(':scanId/report')
  async downloadReport(
    @Param('scanId') scanId: string,
    @Query('format') format: string | undefined,
    @CurrentUser() user: { userId: string; role: Role },
    @Res() res: Response,
  ) {
    const normalized = (format ?? 'md').toLowerCase();
    if (normalized !== 'md' && normalized !== 'json') {
      throw new BadRequestException('format must be either md or json');
    }

    const report = await this.scanService.buildReportDownload(
      scanId,
      user.userId,
      user.role,
      normalized,
    );

    res.setHeader('Content-Type', report.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${report.filename}"`,
    );
    return res.send(report.content);
  }
}
