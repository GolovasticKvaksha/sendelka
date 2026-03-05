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
		.select('id, username, created_at, subscribers_count, total_likes_received, posts_count, is_admin, bio, avatar, medals_count, season_rank, hide_winner_profile')
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
	if (action === 'update_bio') {
	  const token = getTokenFromHeader(req.headers.authorization)
	  const userId = verifyToken(token)

	  if (!userId) {
		return res.status(200).json({ error: 'Не авторизован' })
	  }

	  const { bio } = req.body

	  // Ограничение длины (например, 200 символов)
	  if (bio && bio.length > 200) {
		return res.status(200).json({ error: 'Описание слишком длинное (макс 200 символов)' })
	  }

	  const { error } = await supabase
		.from('users')
		.update({ bio: bio || '' })
		.eq('id', userId)

	  if (error) {
		return res.status(200).json({ error: error.message })
	  }

	  return res.status(200).json({ success: true, bio })
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
	// =========================================
	// ПОЛУЧИТЬ ПОДПИСКИ ПОЛЬЗОВАТЕЛЯ
	// =========================================
	if (action === 'get_subscriptions') {
	  const token = getTokenFromHeader(req.headers.authorization)
	  const userId = verifyToken(token)

	  if (!userId) {
		return res.status(200).json({ error: 'Не авторизован' })
	  }

	  try {
		const { data, error } = await supabase
		  .from('subscriptions')
		  .select('following_id')
		  .eq('follower_id', userId)

		if (error) {
		  return res.status(200).json({ error: error.message })
		}

		return res.status(200).json({ subscriptions: data || [] })
	  } catch (err) {
		console.error('Get subscriptions error:', err)
		return res.status(200).json({ error: 'Internal server error' })
	  }
	}
    return res.status(200).json({ error: 'Unknown action' })

  } catch (err) {
    console.error('User error:', err)
    return res.status(200).json({ error: 'Internal server error' })
  }
}