export class AppError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}
export const notFound = (what = 'Resource') => new AppError(404, 'NOT_FOUND', `${what} not found`);
export const accountBlocked = () => new AppError(403, 'ACCOUNT_BLOCKED', 'Your account has been blocked. Please contact support.');
