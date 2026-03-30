declare namespace Express {
  interface Request {
    csrfToken(): string;
  }
}
