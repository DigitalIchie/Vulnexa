import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard() {
    const [
      totalUsers,
      totalScans,
      runningScans,
      highSeverityFindings,
      recentScans,
      latestAuditEvents,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.scan.count(),
      this.prisma.scan.count({ where: { status: 'running' } }),
      this.prisma.finding.count({ where: { severity: 'high' } }),
      this.prisma.scan.findMany({
        take: 12,
        orderBy: { createdAt: 'desc' },
        include: {
          owner: { select: { email: true } },
          _count: { select: { findings: true } },
        },
      }),
      this.prisma.auditLog.findMany({
        take: 12,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { email: true } } },
      }),
    ]);

    return {
      metrics: {
        totalUsers,
        totalScans,
        runningScans,
        highSeverityFindings,
      },
      recentScans,
      latestAuditEvents,
    };
  }
}
