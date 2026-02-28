import { supabase } from '../../lib/supabase.js'
import { verifyToken, getTokenFromHeader } from '../../lib/auth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const token = getTokenFromHeader(req.headers.authorization)
  const followerId = verifyToken(token)

  if (!followerId) {
    return res.status(401).json({ error: 'Не авторизован' })
  }

  const { followingId } = req.body

  if (followerId === followingId) {
    return res.status(400).json({ error: 'Нельзя подписаться на себя' })
  }

  const { data: existing } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('follower_id', followerId)
    .eq('following_id', followingId)
    .single()

  if (existing) {
    await supabase
      .from('subscriptions')
      .delete()
      .eq('follower_id', followerId)
      .eq('following_id', followingId)

    return res.status(200).json({ subscribed: false })
  } else {
    await supabase
      .from('subscriptions')
      .insert([{ follower_id: followerId, following_id: followingId }])

    await supabase
      .from('notifications')
      .insert([{
        user_id: followingId,
        type: 'subscribe',
        from_user_id: followerId
      }])

    return res.status(200).json({ subscribed: true })
  }
}
