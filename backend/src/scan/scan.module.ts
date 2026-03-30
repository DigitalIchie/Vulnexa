import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CrawlerModule } from '../crawler/crawler.module';
import { ScannerModule } from '../scanner/scanner.module';
import { ScanController } from './scan.controller';
import { ScanService } from './scan.service';

@Module({
  imports: [CrawlerModule, ScannerModule, AuditModule],
  controllers: [ScanController],
  providers: [ScanService],
})
export class ScanModule {}
