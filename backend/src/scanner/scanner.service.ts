import { Injectable, Logger } from '@nestjs/common';
import { Severity } from '../common/types/security.types';

export interface ScannerFinding {
  type: string;
  severity: Severity;
  affectedUrl: string;
  details: string;
}

@Injectable()
export class ScannerService {
  private readonly logger = new Logger(ScannerService.name);
  private readonly xssPayload = '<script>alert("ul_scan")</script>';

  async runXssChecks(urls: string[]): Promise<ScannerFinding[]> {
    const findings: ScannerFinding[] = [];
    const candidates = urls.slice(0, 30);

    for (const url of candidates) {
      const finding = await this.checkReflectedXss(url);
      if (finding) {
        findings.push(finding);
      }
    }

    return findings;
  }

  private async checkReflectedXss(targetUrl: string): Promise<ScannerFinding | null> {
    let url: URL;
    try {
      url = new URL(targetUrl);
    } catch {
      return null;
    }

    url.searchParams.set('q', this.xssPayload);

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { 'User-Agent': 'UL-Scanner/1.0' },
      });
      const body = await response.text();
      if (body.includes(this.xssPayload)) {
        return {
          type: 'Cross-Site Scripting (XSS)',
          severity: Severity.high,
          affectedUrl: url.toString(),
          details:
            'Potential reflected XSS: payload returned unsanitized in response body for query parameter q.',
        };
      }
    } catch (error) {
      this.logger.warn(`XSS check failed for ${targetUrl}: ${(error as Error).message}`);
    }

    return null;
  }
}
