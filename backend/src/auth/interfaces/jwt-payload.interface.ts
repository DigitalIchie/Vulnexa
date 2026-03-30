import { Role } from '../../common/types/security.types';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}
