import { Injectable, PipeTransform } from '@nestjs/common';
import xss from 'xss';

@Injectable()
export class SanitizePipe implements PipeTransform {
  transform(value: unknown): unknown {
    return this.deepSanitize(value);
  }

  private deepSanitize(value: unknown): unknown {
    if (typeof value === 'string') {
      return xss(value.trim());
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.deepSanitize(item));
    }

    if (value && typeof value === 'object') {
      return Object.entries(value as Record<string, unknown>).reduce(
        (acc, [key, val]) => {
          acc[key] = this.deepSanitize(val);
          return acc;
        },
        {} as Record<string, unknown>,
      );
    }

    return value;
  }
}
