import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { chromium } from 'playwright';

@Injectable()
export class CrawlerService {
  private readonly logger = new Logger(CrawlerService.name);
  private readonly outboundProxyUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.outboundProxyUrl = this.configService.get<string>(
      'network.outboundProxyUrl',
      { infer: true },
    ) as string;
  }

  async crawl(
    seedUrl: string,
    allowedDomain: string,
    maxPages: number,
  ): Promise<string[]> {
    const browser = await chromium.launch({
      headless: true,
      proxy: this.outboundProxyUrl
        ? {
            server: this.outboundProxyUrl,
          }
        : undefined,
    });
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();

    const queue: string[] = [seedUrl];
    const visited = new Set<string>();

    try {
      while (queue.length > 0 && visited.size < maxPages) {
        const current = queue.shift();
        if (!current || visited.has(current)) {
          continue;
        }

        visited.add(current);
        try {
          await page.goto(current, {
            waitUntil: 'domcontentloaded',
            timeout: 15000,
          });

          const links = await page.$$eval('a[href]', (anchors) =>
            anchors.map((a) => (a as HTMLAnchorElement).href),
          );

          for (const link of links) {
            if (visited.size + queue.length >= maxPages) {
              break;
            }
            if (this.isAllowedLink(link, allowedDomain) && !visited.has(link)) {
              queue.push(link);
            }
          }
        } catch (error) {
          this.logger.warn(`Failed to crawl ${current}: ${(error as Error).message}`);
        }
      }

      return Array.from(visited);
    } finally {
      await page.close().catch(() => undefined);
      await context.close().catch(() => undefined);
      await browser.close().catch(() => undefined);
    }
  }

  private isAllowedLink(urlString: string, allowedDomain: string) {
    try {
      const url = new URL(urlString);
      const host = url.hostname.toLowerCase();
      return host === allowedDomain || host.endsWith(`.${allowedDomain}`);
    } catch {
      return false;
    }
  }
}
