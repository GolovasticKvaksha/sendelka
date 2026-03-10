import { supabase } from '../lib/supabase.js'
import { verifyToken, getTokenFromHeader } from '../lib/auth.js'

export default async function handler(req, res) {
    try {
        const { action, category, limit = 10, offset = 0 } = req.body

        // ===== ПОЛУЧИТЬ ТОП =====
        if (action === 'get_top') {
            let query
            let countQuery

            switch(category) {
                case 'subscribers':
                    query = supabase
                        .from('users')
                        .select('id, username, avatar, subscribers_count, posts_count, medals_count, status_text')
                        .order('subscribers_count', { ascending: false })
                        .range(offset, offset + limit - 1)
                    
                    countQuery = supabase
                        .from('users')
                        .select('*', { count: 'exact', head: true })
                    break

                case 'posts':
                    query = supabase
                        .from('users')
                        .select('id, username, avatar, subscribers_count, posts_count, medals_count, status_text')
                        .order('posts_count', { ascending: false })
                        .range(offset, offset + limit - 1)
                    
                    countQuery = supabase
                        .from('users')
                        .select('*', { count: 'exact', head: true })
                    break

                case 'medals':
                    query = supabase
                        .from('users')
                        .select('id, username, avatar, subscribers_count, posts_count, seasonal_medals, status_text')
                        .order('seasonal_medals', { ascending: false, nulls_last: true })
                        .range(offset, offset + limit - 1)
                    
                    countQuery = supabase
                        .from('users')
                        .select('*', { count: 'exact', head: true })
                        .gt('seasonal_medals', 0)
                    break

                default:
                    return res.status(200).json({ error: 'Unknown category' })
            }

            const { data, error } = await query
            const { count } = await countQuery

            if (error) {
                return res.status(200).json({ error: error.message })
            }

            const maxLimit = 30
            const hasMore = offset + limit < count && offset + limit < maxLimit

            return res.status(200).json({
                users: data,
                total: Math.min(count, maxLimit),
                hasMore
            })
        }

        // ===== СБРОСИТЬ СЕЗОН (ТОЛЬКО АДМИН) =====
		if (action === 'reset_season') {
			const token = getTokenFromHeader(req.headers.authorization)
			const userId = verifyToken(token)

			if (!userId) {
				return res.status(200).json({ error: 'Не авторизован' })
			}

			const { data: user } = await supabase
				.from('users')
				.select('is_admin')
				.eq('id', userId)
				.single()

			if (!user?.is_admin) {
				return res.status(200).json({ error: 'Недостаточно прав' })
			}

			const { status_4_10, status_2_3, status_1 } = req.body

			// Получаем номер сезона
			const { data: lastSeason } = await supabase
				.from('seasons')
				.select('season_number')
				.order('season_number', { ascending: false })
				.limit(1)
				.maybeSingle()

			const newSeasonNumber = (lastSeason?.season_number || 0) + 1

			// ПОЛУЧАЕМ ТОП-10
			const { data: topUsers } = await supabase
				.from('users')
				.select('id, seasonal_medals')
				.order('seasonal_medals', { ascending: false })
				.limit(10)

			// НАЧИСЛЯЕМ СТАТУСЫ
			for (let i = 0; i < topUsers.length; i++) {
				const user = topUsers[i]
				const rank = i + 1
				let statusText, bioBonus, postsBonus

				if (rank === 1) {
					statusText = status_1 || 'Победитель'
					bioBonus = 20
					postsBonus = 30
				} else if (rank <= 3) {
					statusText = status_2_3 || 'Призёр'
					bioBonus = 10
					postsBonus = 15
				} else {
					statusText = status_4_10 || 'Участник'
					bioBonus = 0
					postsBonus = 0
				}

				await supabase
					.from('user_statuses')
					.insert([{
						user_id: user.id,
						season_number: newSeasonNumber,
						rank: rank,
						status_text: statusText,
						bio_bonus: bioBonus,
						posts_bonus: postsBonus
					}])

				await supabase
					.from('users')
					.update({
						status_text: statusText,
						status_limit_bio: supabase.rpc('increment', { amount: bioBonus }),
						status_limit_posts: supabase.rpc('increment', { amount: postsBonus }),
						season_rank: rank,
						hide_winner_profile: false
					})
					.eq('id', user.id)
			}

			// СОЗДАЁМ СЕЗОН
			await supabase
				.from('seasons')
				.insert([{
					season_number: newSeasonNumber,
					status_4_10: status_4_10 || 'Участник',
					status_2_3: status_2_3 || 'Призёр',
					status_1: status_1 || 'Победитель'
				}])

			// ===== ОБНУЛЯЕМ ВСЕХ =====
			// Простой и надёжный способ — берём всех пользователей
			const { data: allUsers } = await supabase
				.from('users')
				.select('id')

			for (const u of allUsers) {
				await supabase
					.from('users')
					.update({ seasonal_medals: 0 })
					.eq('id', u.id)
			}

			return res.status(200).json({ success: true })
		}

        return res.status(200).json({ error: 'Unknown action' })

    } catch (err) {
        console.error('Top error:', err)
        return res.status(200).json({ error: err.message })
    }
}