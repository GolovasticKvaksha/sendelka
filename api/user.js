import { supabase } from '../lib/supabase.js'
import { verifyToken, getTokenFromHeader } from '../lib/auth.js'

export default async function handler(req, res) {
  try {
    const { action, username, targetUserId } = req.body

    // =========================================
    // ПОЛУЧИТЬ ПРОФИЛЬ
    // =========================================
    if (action === 'profile') {
      const currentUserId = req.body.currentUserId

      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id, username, created_at, subscribers_count, total_likes_received, posts_count, is_admin')
        .eq('username', username)
        .single()

      if (userError || !user) {
        return res.status(200).json({ error: 'Пользователь не найден' })
      }

      const { data: posts, error: postsError } = await supabase
        .from('posts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      let isSubscribed = false
      if (currentUserId) {
        const { data: sub } = await supabase
          .from('subscriptions')
          .select('id')
          .eq('follower_id', currentUserId)
          .eq('following_id', user.id)
          .maybeSingle()

        isSubscribed = !!sub
      }

      return res.status(200).json({
        ...user,
        posts: posts || [],
        isSubscribed
      })
    }

    // =========================================
    // ПОДПИСАТЬСЯ/ОТПИСАТЬСЯ
    // =========================================
    if (action === 'subscribe') {
      const token = getTokenFromHeader(req.headers.authorization)
      const followerId = verifyToken(token)

      if (!followerId) {
        return res.status(200).json({ error: 'Не авторизован' })
      }

      const followingId = targetUserId

      if (followerId === followingId) {
        return res.status(200).json({ error: 'Нельзя подписаться на себя' })
      }

      const { data: existing } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('follower_id', followerId)
        .eq('following_id', followingId)
        .maybeSingle()

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
	// =========================================
	// ПОЛУЧИТЬ КОЛИЧЕСТВО ПОЛЬЗОВАТЕЛЕЙ
	// =========================================
	if (action === 'total_users') {
	  const { count, error } = await supabase
		.from('users')
		.select('*', { count: 'exact', head: true })

	  if (error) {
		return res.status(200).json({ error: error.message })
	  }

	  return res.status(200).json({ total: count })
	}
    return res.status(200).json({ error: 'Unknown action' })

  } catch (err) {
    console.error('User error:', err)
    return res.status(200).json({ error: 'Internal server error' })
  }
}