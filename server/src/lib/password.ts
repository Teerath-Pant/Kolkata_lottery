// Passwords that pass the length/letter/digit rules but are among the first things attackers try.
const COMMON = new Set([
  'password1', 'password12', 'password123', 'password1234', 'passw0rd', 'p@ssw0rd', 'p@ssword1', 'pass1234', 'pass@123',
  'qwerty12', 'qwerty123', 'qwerty1234', 'qwerty@123', 'asdf1234', 'asdfgh123', 'zxcvbnm1', 'abcd1234', 'abc12345', 'abc123456',
  'a1b2c3d4', '1qaz2wsx', 'q1w2e3r4', '1q2w3e4r', '12345678a', 'a12345678', '1234abcd', '123456789a', 'abcdefg1',
  'admin123', 'admin1234', 'admin@123', 'admin@1234', 'root1234', 'test1234', 'user1234', 'temp1234', 'guest123',
  'welcome1', 'welcome123', 'letmein1', 'letmein123', 'changeme1', 'changeme123', 'default123', 'secret123', 'secret1234',
  'iloveyou1', 'iloveyou123', 'hello1234', 'hello@123', 'monkey123', 'dragon123', 'master123', 'shadow123', 'sunshine1',
  'princess1', 'superman1', 'baseball1', 'football1', 'cricket123', 'india123', 'india@123', 'bharat123', 'krishna123',
  'ganesh123', 'shiva123', 'lucky123', 'luckydraw1', 'lottery123', 'game1234', 'coins123',
]);

const MIN = 8;
const MAX = 72; // bcrypt ignores everything after 72 bytes

/** Returns a human-readable reason the password is not acceptable, or null when it is fine. */
export function passwordProblem(pw: string, ctx: { username?: string; phone?: string } = {}): string | null {
  if (pw.length < MIN) return `Password must be at least ${MIN} characters`;
  if (pw.length > MAX) return `Password must be at most ${MAX} characters`;
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Password must contain at least one letter and one digit';
  if (/^(.)\1+$/.test(pw)) return 'Password cannot be a single repeated character';
  const lower = pw.toLowerCase();
  if (COMMON.has(lower)) return 'That password is too common, choose another one';
  if (ctx.username && ctx.username.length >= 4 && lower.includes(ctx.username.toLowerCase())) return 'Password cannot contain your User ID';
  if (ctx.phone && lower.includes(ctx.phone)) return 'Password cannot contain your mobile number';
  return null;
}
