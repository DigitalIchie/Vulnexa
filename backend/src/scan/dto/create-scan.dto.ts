import { IsNotEmpty, IsUrl, MaxLength } from 'class-validator';

export class CreateScanDto {
  @IsUrl({
    protocols: ['http', 'https'],
    require_tld: true,
    require_protocol: true,
  })
  @IsNotEmpty()
  @MaxLength(2048)
  targetUrl!: string;
}
