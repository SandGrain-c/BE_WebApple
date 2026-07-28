declare global {
  namespace Express {
    interface AuthenticatedUser {
      userId: number;
      role: string;
    }

    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export {};
