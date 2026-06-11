export interface AuthUser { id: string; email: string; }

export interface AuthSession {
  token: string;         // access token (Bearer for game endpoints)
  refreshToken: string;
  user: AuthUser;
}

/**
 * Player auth port. Adapters throw GameError with an HTTP status:
 * 409 email taken, 401 bad credentials / bad token, 400 bad input.
 */
export interface PlayerAuthStore {
  register(email: string, password: string): Promise<AuthSession>;
  login(email: string, password: string): Promise<AuthSession>;
  refresh(refreshToken: string): Promise<AuthSession>;
  verifyToken(accessToken: string): Promise<AuthUser>;
}
