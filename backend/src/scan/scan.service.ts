import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { Role, ScanStatus } from '../common/types/security.types';
import { CrawlerService } from '../crawler/crawler.service';
import { PrismaService } from '../prisma/prisma.service';
import { ScannerService } from '../scanner/scanner.service';
import { CreateScanDto } from './dto/create-scan.dto';

@Injectable()
export class ScanService {
  private readonly logger = new Logger(ScanService.name);
  private readonly allowedDomains: string[];
  private readonly maxCrawlPages: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crawlerService: CrawlerService,
    private readonly scannerService: ScannerService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
  ) {
    const domains = this.configService.get('scan.allowedDomains', {
      infer: true,
    });
    this.allowedDomains = Array.isArray(domains) ? domains : [];
    this.maxCrawlPages = this.configService.get<number>('scan.maxCrawlPages', {
      infer: true,
    }) as number;
  }

  async createScan(dto: CreateScanDto, userId: string) {
    const parsed = this.parseAndValidateTarget(dto.targetUrl);

    const scan = await this.prisma.scan.create({
      data: {
        ownerId: userId,
        targetUrl: parsed.targetUrl,
        targetDomain: parsed.targetDomain,
        status: ScanStatus.queued,
      },
    });

    await this.auditService.logUserAction('scan.create', userId, {
      scanId: scan.id,
      targetUrl: scan.targetUrl,
    });

    void this.processScan(scan.id).catch((error: Error) => {
      this.logger.error(`Scan execution failed for ${scan.id}: ${error.message}`);
    });

    return scan;
  }

  async listScans(requestingUserId: string, role: Role) {
    const where: Prisma.ScanWhereInput =
      role === Role.admin ? {} : { ownerId: requestingUserId };

    await this.auditService.logUserAction('scan.list', requestingUserId, {
      role,
    });

    return this.prisma.scan.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        findings: {
          select: { id: true, severity: true, type: true },
        },
      },
    });
  }

  async getScanById(scanId: string, requestingUserId: string, role: Role) {
    const scan = await this.prisma.scan.findUnique({
      where: { id: scanId },
      include: {
        findings: true,
      },
    });

    if (!scan) {
      throw new NotFoundException('Scan not found');
    }

    this.ensureOwnership(scan.ownerId, requestingUserId, role);
    await this.auditService.logUserAction('scan.get', requestingUserId, { scanId });

    return scan;
  }

  async getFindings(scanId: string, requestingUserId: string, role: Role) {
    const scan = await this.prisma.scan.findUnique({
      where: { id: scanId },
      select: { id: true, ownerId: true },
    });
    if (!scan) {
      throw new NotFoundException('Scan not found');
    }

    this.ensureOwnership(scan.ownerId, requestingUserId, role);
    await this.auditService.logUserAction('scan.findings', requestingUserId, { scanId });

    return this.prisma.finding.findMany({
      where: { scanId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async buildReportDownload(
    scanId: string,
    requestingUserId: string,
    role: Role,
    format: 'md' | 'json' = 'md',
  ) {
    const scan = await this.getScanById(scanId, requestingUserId, role);
    const findings = scan.findings ?? [];
    const counts = this.calculateSeverityCounts(findings);
    const remediation = this.recommendRemediation(findings.map((finding) => finding.type));

    const payload = {
      scan: {
        id: scan.id,
        targetUrl: scan.targetUrl,
        targetDomain: scan.targetDomain,
        status: scan.status,
        startedAt: scan.startedAt,
        completedAt: scan.completedAt,
        createdAt: scan.createdAt,
      },
      summary: {
        totalFindings: findings.length,
        severity: counts,
      },
      findings: findings.map((finding) => ({
        type: finding.type,
        severity: finding.severity,
        affectedUrl: finding.affectedUrl,
        details: finding.details,
      })),
      remediation,
      generatedAt: new Date().toISOString(),
    };

    await this.auditService.logUserAction('scan.report.download', requestingUserId, {
      scanId,
      format,
    });

    if (format === 'json') {
      return {
        filename: `scan-report-${scan.id}.json`,
        contentType: 'application/json; charset=utf-8',
        content: JSON.stringify(payload, null, 2),
      };
    }

    return {
      filename: `scan-report-${scan.id}.md`,
      contentType: 'text/markdown; charset=utf-8',
      content: this.toMarkdownReport(payload),
    };
  }

  private async processScan(scanId: string) {
    await this.prisma.scan.update({
      where: { id: scanId },
      data: { status: ScanStatus.running, startedAt: new Date() },
    });

    const scan = await this.prisma.scan.findUnique({
      where: { id: scanId },
      select: { id: true, targetUrl: true, targetDomain: true, ownerId: true },
    });
    if (!scan) {
      return;
    }

    await this.auditService.logUserAction('scan.started', scan.ownerId, { scanId });

    try {
      const crawledUrls = await this.crawlerService.crawl(
        scan.targetUrl,
        scan.targetDomain,
        this.maxCrawlPages,
      );
      const findings = await this.scannerService.runXssChecks(crawledUrls);

      await this.prisma.$transaction(async (tx) => {
        if (findings.length > 0) {
          await tx.finding.createMany({
            data: findings.map((finding) => ({
              scanId: scan.id,
              type: finding.type,
              severity: finding.severity,
              affectedUrl: finding.affectedUrl,
              details: finding.details,
            })),
          });
        }
        await tx.scan.update({
          where: { id: scan.id },
          data: {
            status: ScanStatus.completed,
            completedAt: new Date(),
          },
        });
      });

      await this.auditService.logUserAction('scan.completed', scan.ownerId, {
        scanId: scan.id,
        findingsCount: findings.length,
      });
    } catch (error) {
      await this.prisma.scan.update({
        where: { id: scan.id },
        data: {
          status: ScanStatus.failed,
          completedAt: new Date(),
        },
      });
      await this.auditService.logUserAction('scan.failed', scan.ownerId, {
        scanId: scan.id,
        reason: (error as Error).message,
      });
      throw error;
    }
  }

  private parseAndValidateTarget(targetUrl: string) {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(targetUrl);
    } catch {
      throw new ForbiddenException('Invalid target URL');
    }

    const hostname = parsedUrl.hostname.toLowerCase();
    if (!this.isTargetAllowed(hostname)) {
      throw new ForbiddenException(
        'Target domain is outside of authorized scan scope',
      );
    }

    return {
      targetUrl: parsedUrl.toString(),
      targetDomain: hostname,
    };
  }

  private isTargetAllowed(hostname: string): boolean {
    // If no allowlist is configured, allow all domains
    if (this.allowedDomains.length === 0) {
      return true;
    }

    return this.allowedDomains.some(
      (allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`),
    );
  }

  private ensureOwnership(ownerId: string, userId: string, role: Role) {
    if (role === Role.admin) {
      return;
    }
    if (ownerId !== userId) {
      throw new ForbiddenException('You cannot access scans owned by another user');
    }
  }

  private calculateSeverityCounts(
    findings: Array<{ severity: string }>,
  ): Record<'high' | 'medium' | 'low', number> {
    return findings.reduce(
      (acc, finding) => {
        const severity = finding.severity.toLowerCase();
        if (severity === 'high' || severity === 'medium' || severity === 'low') {
          acc[severity] += 1;
        }
        return acc;
      },
      { high: 0, medium: 0, low: 0 },
    );
  }

  private recommendRemediation(types: string[]) {
    const lowerTypes = types.map((type) => type.toLowerCase());
    const suggestions: string[] = [];

    if (lowerTypes.some((type) => type.includes('xss'))) {
      suggestions.push(
        'Apply strict output encoding and context-aware sanitization for all user-supplied inputs.',
      );
    }
    if (lowerTypes.some((type) => type.includes('sql'))) {
      suggestions.push(
        'Use parameterized database calls only and validate query parameters before persistence operations.',
      );
    }

    suggestions.push(
      'Harden session settings with Secure, HttpOnly, and SameSite cookie attributes.',
    );
    suggestions.push(
      'Implement continuous monitoring and retest after each remediation deployment.',
    );

    return suggestions;
  }

  private toMarkdownReport(payload: {
    scan: {
      id: string;
      targetUrl: string;
      targetDomain: string;
      status: string;
      startedAt: Date | null;
      completedAt: Date | null;
      createdAt: Date;
    };
    summary: {
      totalFindings: number;
      severity: Record<'high' | 'medium' | 'low', number>;
    };
    findings: Array<{
      type: string;
      severity: string;
      affectedUrl: string;
      details: string;
    }>;
    remediation: string[];
    generatedAt: string;
  }) {
    const lines: string[] = [];

    lines.push('# Vulnerability Scan Report');
    lines.push('');
    lines.push(`- Report Generated: ${payload.generatedAt}`);
    lines.push(`- Scan ID: ${payload.scan.id}`);
    lines.push(`- Target URL: ${payload.scan.targetUrl}`);
    lines.push(`- Target Domain: ${payload.scan.targetDomain}`);
    lines.push(`- Status: ${payload.scan.status}`);
    lines.push(`- Created At: ${payload.scan.createdAt.toISOString()}`);
    lines.push(`- Started At: ${payload.scan.startedAt?.toISOString() ?? 'N/A'}`);
    lines.push(`- Completed At: ${payload.scan.completedAt?.toISOString() ?? 'N/A'}`);
    lines.push('');
    lines.push('## Summary');
    lines.push('');
    lines.push(`- Total Findings: ${payload.summary.totalFindings}`);
    lines.push(`- High Severity: ${payload.summary.severity.high}`);
    lines.push(`- Medium Severity: ${payload.summary.severity.medium}`);
    lines.push(`- Low Severity: ${payload.summary.severity.low}`);
    lines.push('');
    lines.push('## Findings');
    lines.push('');

    if (payload.findings.length === 0) {
      lines.push('No vulnerabilities detected for this scan.');
    } else {
      payload.findings.forEach((finding, index) => {
        lines.push(`### ${index + 1}. ${finding.type}`);
        lines.push(`- Severity: ${finding.severity}`);
        lines.push(`- Affected URL: ${finding.affectedUrl}`);
        lines.push(`- Details: ${finding.details}`);
        lines.push('');
      });
    }

    lines.push('## Remediation Suggestions');
    lines.push('');
    payload.remediation.forEach((item, idx) => {
      lines.push(`${idx + 1}. ${item}`);
    });
    lines.push('');

    return lines.join('\n');
  }
}
