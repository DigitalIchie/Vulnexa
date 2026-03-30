import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async logUserAction(
    action: string,
    userId?: string,
    metadata?: Record<string, unknown>,
    tx?: PrismaClient | PrismaService,
  ) {
    const client = tx ?? this.prisma;
    await client.auditLog.create({
      data: {
        action,
        userId,
        metadata: metadata ? JSON.stringify(metadata) : null,
      },
    });
  }
}
