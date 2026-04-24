import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret'
const DEFAULT_INTERNAL_TOKEN_TTL = process.env.INTERNAL_BOT_TOKEN_TTL || '15m'

export function signUserAccessToken(
  user: {
    id: string
    email: string
  },
  options?: {
    expiresIn?: string | number
  },
): string {
  const signOptions = {
    expiresIn: (options?.expiresIn ?? DEFAULT_INTERNAL_TOKEN_TTL) as jwt.SignOptions['expiresIn'],
  } as jwt.SignOptions

  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
    },
    JWT_SECRET as jwt.Secret,
    signOptions,
  )
}
