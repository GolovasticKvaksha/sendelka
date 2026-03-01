export function verifyToken(token) {
  if (!token) return null
  try {
    const decoded = Buffer.from(token, 'base64').toString().split(':')
    return parseInt(decoded[0])
  } catch {
    return null
  }
}

export function getTokenFromHeader(authorization) {
  if (!authorization) return null
  return authorization.split(' ')[1]
}