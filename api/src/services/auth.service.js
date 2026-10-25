import { burnPasswordCheck, hashPassword, verifyPassword } from '../auth/passwords.js';
import { AppError, conflict } from '../errors.js';
import { authRepo } from '../repositories/auth.repo.js';
import { organizationsRepo } from '../repositories/organizations.repo.js';
import { serializeOrg, serializeUser } from '../serializers.js';

const invalidCredentials = () =>
  new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');

const emailTaken = () => conflict('EMAIL_TAKEN', 'An account with this email already exists');

export async function signup({ orgName, name, email, password }, config) {
  if (await authRepo.emailExists(email)) throw emailTaken();
  const passwordHash = await hashPassword(password);
  try {
    const { org, user } = await authRepo.createOrganizationWithAdmin({
      orgName,
      slaMinutes: config.slaMinutes,
      email,
      name,
      passwordHash,
    });
    return { user: serializeUser(user), org: serializeOrg(org), userId: user._id };
  } catch (err) {
    if (err?.code === 11000) throw emailTaken();
    throw err;
  }
}

export async function login({ email, password }) {
  const user = await authRepo.findUserByEmail(email);
  if (!user) {
    await burnPasswordCheck(password);
    throw invalidCredentials();
  }
  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok || user.status !== 'active') throw invalidCredentials();
  const org = await organizationsRepo.get({ orgId: user.orgId, userId: user._id, role: user.role });
  return { user: serializeUser(user), org: serializeOrg(org), userId: user._id };
}

export async function me(ctx, user) {
  const org = await organizationsRepo.get(ctx);
  return { user: serializeUser(user), org: serializeOrg(org) };
}
