import { supabase } from '../lib/supabase.js'
import { verifyToken, getTokenFromHeader } from '../lib/auth.js'

export default async function handler(req, res) {
  try {
    const { action, postId, filter } = req.body

    // =========================================
    // ПОЛУЧИТЬ ЛЕНТУ
    // =========================================
    if (action === 'feed') {
	  const currentUserId = req.body.userId
	  const filterType = req.body.filter || 'all'
	  const limit = req.body.limit || 8  // сколько постов загружаем
	  const offset = req.body.offset || 0 // сколько уже пропустили

	  let query = supabase
		.from('posts')
		.select('*, users(id, username, is_admin)', { count: 'exact' }) // добавляем count
		.order('created_at', { ascending: false })
		.range(offset, offset + limit - 1) // пагинация через range

	  if (filterType === 'subscriptions' && currentUserId) {
		const { data: subs } = await supabase
		  .from('subscriptions')
		  .select('following_id')
		  .eq('follower_id', currentUserId)

		if (subs?.length) {
		  query = query.in('user_id', subs.map(s => s.following_id))
		} else {
		  return res.status(200).json({ posts: [], total: 0 })
		}
	  }

	  const { data: posts, error, count } = await query

	  if (error) {
		return res.status(200).json({ error: error.message })
	  }

	  // Получаем просмотренные посты
	  if (currentUserId) {
		const { data: views } = await supabase
		  .from('post_views')
		  .select('post_id')
		  .eq('user_id', currentUserId)

		const viewedPostIds = new Set(views?.map(v => v.post_id) || [])

		// Начисляем просмотры за новые посты
		for (const post of posts) {
		  if (post.user_id !== parseInt(currentUserId) && !viewedPostIds.has(post.id)) {
			await supabase
			  .from('post_views')
			  .insert([{ user_id: currentUserId, post_id: post.id }])

			await supabase.rpc('increment_post_views', { post_id: post.id })
			post.views_count = (post.views_count || 0) + 1
		  }
		}
	  }

	  // Проверяем лайки
	  if (currentUserId) {
		const { data: userLikes } = await supabase
		  .from('likes')
		  .select('post_id')
		  .eq('user_id', currentUserId)

		const likedPostIds = new Set(userLikes?.map(l => l.post_id) || [])

		const postsWithLikes = posts.map(post => ({
		  ...post,
		  isLiked: likedPostIds.has(post.id)
		}))

		return res.status(200).json({
		  posts: postsWithLikes,
		  total: count,
		  hasMore: offset + limit < count
		})
	  }

	  return res.status(200).json({
		posts: posts,
		total: count,
		hasMore: offset + limit < count
	  })
	}

    // =========================================
    // СОЗДАТЬ ПОСТ
    // =========================================
    if (action === 'create') {
	  const token = getTokenFromHeader(req.headers.authorization)
	  const userId = verifyToken(token)

	  if (!userId) {
		return res.status(200).json({ error: 'Не авторизован' })
	  }

	  const { content, imageUrl } = req.body

	  if (!content) {
		return res.status(200).json({ error: 'Пост не может быть пустым' })
	  }

	  if (content.length > 600) {
		return res.status(200).json({ error: `Максимум 600 символов (сейчас ${content.length})` })
	  }

	  // Проверяем, является ли пользователь админом (для фото)
	  const { data: user } = await supabase
		.from('users')
		.select('is_admin')
		.eq('id', userId)
		.single()

	  const isAdmin = user?.is_admin || false

	  // Проверка антиспама
	  const eightMinutesAgo = new Date(Date.now() - 8 * 60 * 1000).toISOString()
	  const { count, error: countError } = await supabase
		.from('posts')
		.select('*', { count: 'exact', head: true })
		.eq('user_id', userId)
		.gte('created_at', eightMinutesAgo)

	  if (countError) {
		return res.status(200).json({ error: 'Ошибка проверки антиспама' })
	  }

	  if (count >= 5) {
		return res.status(200).json({ error: 'Слишком часто! Подожди немного.' })
	  }

	  // Создаём пост (с фото только для админов)
	  const postData = {
		content,
		user_id: userId,
		likes_count: 0,
		views_count: 0
	  }

	  // Если админ и передана ссылка на фото — добавляем
	  if (isAdmin && imageUrl) {
		// Простая валидация URL
		if (imageUrl.match(/\.(jpeg|jpg|gif|png|webp)$/i)) {
		  postData.image_url = imageUrl
		}
	  }

	  const { data, error } = await supabase
		.from('posts')
		.insert([postData])
		.select()

	  if (error) {
		return res.status(200).json({ error: error.message })
	  }

	  await supabase.rpc('increment_user_posts', { user_id: userId })

	  return res.status(200).json(data[0])
	}

    // =========================================
    // ЛАЙКНУТЬ/УБРАТЬ ЛАЙК
    // =========================================
    if (action === 'like') {
      const token = getTokenFromHeader(req.headers.authorization)
      const userId = verifyToken(token)

      if (!userId) {
        return res.status(200).json({ error: 'Не авторизован' })
      }

      const { postId } = req.body

      const { data: existingLike } = await supabase
        .from('likes')
        .select('id')
        .eq('user_id', userId)
        .eq('post_id', postId)
        .maybeSingle()

      if (existingLike) {
        await supabase
          .from('likes')
          .delete()
          .eq('user_id', userId)
          .eq('post_id', postId)

        return res.status(200).json({ liked: false })
      } else {
        await supabase
          .from('likes')
          .insert([{ user_id: userId, post_id: postId }])

        const { data: post } = await supabase
          .from('posts')
          .select('user_id')
          .eq('id', postId)
          .single()

        if (post.user_id !== userId) {
          await supabase
            .from('notifications')
            .insert([{
              user_id: post.user_id,
              type: 'like',
              from_user_id: userId,
              post_id: postId
            }])
        }

        return res.status(200).json({ liked: true })
      }
    }

    // =========================================
    // УДАЛИТЬ ПОСТ
    // =========================================
    if (action === 'delete') {
      const token = getTokenFromHeader(req.headers.authorization)
      const userId = verifyToken(token)

      if (!userId) {
        return res.status(200).json({ error: 'Не авторизован' })
      }

      const { postId } = req.body

      if (!postId) {
        return res.status(200).json({ error: 'ID поста не указан' })
      }

      // Получаем информацию о посте
      const { data: post, error: postError } = await supabase
        .from('posts')
        .select('user_id')
        .eq('id', postId)
        .single()

      if (postError || !post) {
        return res.status(200).json({ error: 'Пост не найден' })
      }

      // Проверяем, является ли пользователь админом
      const { data: user } = await supabase
        .from('users')
        .select('is_admin')
        .eq('id', userId)
        .single()

      const isAdmin = user?.is_admin || false

      // Разрешаем удаление если:
      // 1. Пользователь - автор поста
      // 2. ИЛИ пользователь - админ
      if (post.user_id !== userId && !isAdmin) {
        return res.status(200).json({ error: 'Недостаточно прав' })
      }

      // Удаляем пост
      const { error } = await supabase
        .from('posts')
        .delete()
        .eq('id', postId)

      if (error) {
        return res.status(200).json({ error: error.message })
      }
	  
	  // ===== УМЕНЬШАЕМ СЧЕТЧИК ПОСТОВ У ПОЛЬЗОВАТЕЛЯ =====
	  await supabase.rpc('decrement_user_posts', { user_id: post.user_id })

	  return res.status(200).json({ success: true })
	  
    }

    return res.status(200).json({ error: 'Unknown action' })

  } catch (err) {
    console.error('Posts error:', err)
    return res.status(200).json({ error: 'Internal server error' })
  }
}