-- ============================================================
-- כושרמט - סכמת מסד נתונים מלאה עבור Supabase
-- הרץ קובץ זה פעם אחת ב-SQL Editor של הפרויקט שלך ב-Supabase
-- (Dashboard -> SQL Editor -> New query -> הדבק והרץ)
-- קובץ זה בטוח להרצה חוזרת (idempotent)
-- ============================================================

create extension if not exists "uuid-ossp";

-- ============================================================
-- טבלת פרופילים (משתמשים)
-- ============================================================
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  avatar_emoji text not null default '♟️',
  rating int not null default 1200,
  points int not null default 0,
  wins int not null default 0,
  losses int not null default 0,
  draws int not null default 0,
  games_played int not null default 0,
  win_streak int not null default 0,
  best_streak int not null default 0,
  is_admin boolean not null default false,
  is_banned boolean not null default false,
  banned_reason text,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

drop policy if exists "profiles are viewable by everyone" on profiles;
create policy "profiles are viewable by everyone"
  on profiles for select
  using (true);

drop policy if exists "users can update their own profile" on profiles;
create policy "users can update their own profile"
  on profiles for update
  using (auth.uid() = id);

-- שדות רגישים (rating, points, wins...) מוגנים ע"י טריגר, לא ע"י RLS,
-- כדי לאפשר עדכון עצמי של שם/אווטאר בלבד.

create or replace function protect_profile_fields()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('app.bypass_protect', true), '') <> 'on' then
    new.rating := old.rating;
    new.points := old.points;
    new.wins := old.wins;
    new.losses := old.losses;
    new.draws := old.draws;
    new.games_played := old.games_played;
    new.win_streak := old.win_streak;
    new.best_streak := old.best_streak;
    new.is_admin := old.is_admin;
    new.is_banned := old.is_banned;
    new.banned_reason := old.banned_reason;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_profile on profiles;
create trigger trg_protect_profile
  before update on profiles
  for each row execute function protect_profile_fields();

-- יצירת פרופיל אוטומטית עם הרשמה
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', 'שחקן_' || substr(new.id::text, 1, 6))
  );
  return new;
end;
$$;

drop trigger if exists trg_handle_new_user on auth.users;
create trigger trg_handle_new_user
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================
-- מדליות
-- ============================================================
create table if not exists medals (
  id serial primary key,
  code text unique not null,
  name text not null,
  description text not null,
  icon text not null
);

insert into medals (code, name, description, icon) values
  ('first_win', 'ניצחון ראשון', 'ניצחת במשחק הראשון שלך', '🥇'),
  ('ten_wins', 'צובר נצחונות', '10 ניצחונות', '🏆'),
  ('fifty_wins', 'אלוף ותיק', '50 ניצחונות', '👑'),
  ('streak_5', 'רצף מנצח', '5 ניצחונות ברצף', '🔥'),
  ('streak_10', 'בלתי עציר', '10 ניצחונות ברצף', '⚡'),
  ('rating_1400', 'מומחה מתפתח', 'הגעת לדירוג 1400', '📈'),
  ('rating_1600', 'שחקן מנוסה', 'הגעת לדירוג 1600', '🎯'),
  ('rating_1800', 'רב-אמן מקומי', 'הגעת לדירוג 1800', '🧠'),
  ('rating_2000', 'רב-אמן בין-לאומי', 'הגעת לדירוג 2000', '🌟'),
  ('rating_2200', 'גרנדמאסטר', 'הגעת לדירוג 2200', '💎'),
  ('games_100', 'ותיק הזירה', 'שיחקת 100 משחקים', '🎖️')
on conflict (code) do nothing;

create table if not exists user_medals (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references profiles(id) on delete cascade,
  medal_id int references medals(id) on delete cascade,
  awarded_at timestamptz not null default now(),
  unique (user_id, medal_id)
);

alter table medals enable row level security;
drop policy if exists "medals viewable by everyone" on medals;
create policy "medals viewable by everyone" on medals for select using (true);

alter table user_medals enable row level security;
drop policy if exists "user medals viewable by everyone" on user_medals;
create policy "user medals viewable by everyone" on user_medals for select using (true);

-- ============================================================
-- משחקים
-- ============================================================
create table if not exists games (
  id uuid primary key default uuid_generate_v4(),
  white_id uuid references profiles(id),
  black_id uuid references profiles(id),
  fen text not null default 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  pgn text not null default '',
  last_move text,
  status text not null default 'active', -- active | checkmate | draw | resigned | timeout | aborted
  winner_id uuid references profiles(id),
  turn text not null default 'w',
  white_time_ms int not null default 600000,
  black_time_ms int not null default 600000,
  draw_offered_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table games enable row level security;

drop policy if exists "games viewable by everyone" on games;
create policy "games viewable by everyone" on games for select using (true);

drop policy if exists "participants can update their game" on games;
create policy "participants can update their game" on games for update
  using (auth.uid() = white_id or auth.uid() = black_id);

drop policy if exists "admins can update any game" on games;
create policy "admins can update any game" on games for update
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));

create or replace function touch_games_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end; $$;

drop trigger if exists trg_games_updated_at on games;
create trigger trg_games_updated_at before update on games
  for each row execute function touch_games_updated_at();

-- ============================================================
-- תור השידוכים (matchmaking)
-- ============================================================
create table if not exists matchmaking_queue (
  user_id uuid primary key references profiles(id) on delete cascade,
  rating int not null,
  joined_at timestamptz not null default now()
);

alter table matchmaking_queue enable row level security;

drop policy if exists "users manage their own queue row" on matchmaking_queue;
create policy "users manage their own queue row" on matchmaking_queue
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "queue viewable by owner" on matchmaking_queue;
create policy "queue viewable by owner" on matchmaking_queue
  for select using (auth.uid() = user_id);

create or replace function try_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  opponent record;
  is_white boolean;
begin
  select * into opponent from matchmaking_queue
    where user_id <> new.user_id
    order by abs(rating - new.rating), joined_at
    limit 1
    for update skip locked;

  if found then
    is_white := random() < 0.5;
    insert into games (white_id, black_id)
    values (
      case when is_white then new.user_id else opponent.user_id end,
      case when is_white then opponent.user_id else new.user_id end
    );
    delete from matchmaking_queue where user_id in (new.user_id, opponent.user_id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_try_match on matchmaking_queue;
create trigger trg_try_match after insert on matchmaking_queue
  for each row execute function try_match();

-- ============================================================
-- צ'אט (גלובלי כאשר game_id הוא null, או צ'אט משחק)
-- ============================================================
create table if not exists chat_messages (
  id uuid primary key default uuid_generate_v4(),
  game_id uuid references games(id) on delete cascade,
  sender_id uuid references profiles(id),
  message text not null,
  created_at timestamptz not null default now()
);

alter table chat_messages enable row level security;

drop policy if exists "chat viewable by everyone" on chat_messages;
create policy "chat viewable by everyone" on chat_messages for select using (true);

drop policy if exists "authenticated non-banned users can send chat" on chat_messages;
create policy "authenticated non-banned users can send chat" on chat_messages
  for insert with check (
    auth.uid() = sender_id
    and not exists (select 1 from profiles p where p.id = auth.uid() and p.is_banned)
  );

-- ============================================================
-- דיווחים (מודרציה)
-- ============================================================
create table if not exists reports (
  id uuid primary key default uuid_generate_v4(),
  reporter_id uuid references profiles(id),
  reported_id uuid references profiles(id),
  game_id uuid references games(id),
  reason text not null,
  status text not null default 'open', -- open | reviewed | dismissed | actioned
  created_at timestamptz not null default now(),
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz
);

alter table reports enable row level security;

drop policy if exists "users can create reports" on reports;
create policy "users can create reports" on reports
  for insert with check (auth.uid() = reporter_id);

drop policy if exists "reporters can view their own reports" on reports;
create policy "reporters can view their own reports" on reports
  for select using (auth.uid() = reporter_id);

drop policy if exists "admins can view all reports" on reports;
create policy "admins can view all reports" on reports
  for select using (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));

drop policy if exists "admins can update reports" on reports;
create policy "admins can update reports" on reports
  for update using (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));

-- ============================================================
-- פונקציה: סיום משחק, עדכון ELO, ניקוד, סטרייקים ומדליות
-- ============================================================
create or replace function finish_game(p_game_id uuid, p_status text, p_winner_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  g games%rowtype;
  white_rating int;
  black_rating int;
  expected_white numeric;
  expected_black numeric;
  score_white numeric;
  score_black numeric;
  k int := 32;
  new_white_rating int;
  new_black_rating int;
begin
  select * into g from games where id = p_game_id;
  if not found or g.status <> 'active' then
    return;
  end if;

  perform set_config('app.bypass_protect', 'on', true);

  update games set status = p_status, winner_id = p_winner_id where id = p_game_id;

  select rating into white_rating from profiles where id = g.white_id;
  select rating into black_rating from profiles where id = g.black_id;

  expected_white := 1.0 / (1.0 + power(10, (black_rating - white_rating) / 400.0));
  expected_black := 1.0 - expected_white;

  if p_winner_id = g.white_id then
    score_white := 1; score_black := 0;
  elsif p_winner_id = g.black_id then
    score_white := 0; score_black := 1;
  else
    score_white := 0.5; score_black := 0.5;
  end if;

  new_white_rating := round(white_rating + k * (score_white - expected_white));
  new_black_rating := round(black_rating + k * (score_black - expected_black));

  -- עדכון שחקן לבן
  update profiles set
    rating = greatest(new_white_rating, 100),
    points = points + case when score_white = 1 then 10 when score_white = 0.5 then 3 else 0 end,
    wins = wins + case when score_white = 1 then 1 else 0 end,
    losses = losses + case when score_white = 0 then 1 else 0 end,
    draws = draws + case when score_white = 0.5 then 1 else 0 end,
    games_played = games_played + 1,
    win_streak = case when score_white = 1 then win_streak + 1 else 0 end,
    best_streak = greatest(best_streak, case when score_white = 1 then win_streak + 1 else 0 end)
  where id = g.white_id;

  -- עדכון שחקן שחור
  update profiles set
    rating = greatest(new_black_rating, 100),
    points = points + case when score_black = 1 then 10 when score_black = 0.5 then 3 else 0 end,
    wins = wins + case when score_black = 1 then 1 else 0 end,
    losses = losses + case when score_black = 0 then 1 else 0 end,
    draws = draws + case when score_black = 0.5 then 1 else 0 end,
    games_played = games_played + 1,
    win_streak = case when score_black = 1 then win_streak + 1 else 0 end,
    best_streak = greatest(best_streak, case when score_black = 1 then win_streak + 1 else 0 end)
  where id = g.black_id;

  perform award_medals(g.white_id);
  perform award_medals(g.black_id);

  perform set_config('app.bypass_protect', 'off', true);
end;
$$;

-- ============================================================
-- פונקציה: הענקת מדליות אוטומטית לפי סטטיסטיקות
-- ============================================================
create or replace function award_medals(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p profiles%rowtype;
begin
  select * into p from profiles where id = p_user_id;
  if not found then return; end if;

  if p.wins >= 1 then
    insert into user_medals (user_id, medal_id)
      select p_user_id, id from medals where code = 'first_win'
      on conflict do nothing;
  end if;
  if p.wins >= 10 then
    insert into user_medals (user_id, medal_id)
      select p_user_id, id from medals where code = 'ten_wins'
      on conflict do nothing;
  end if;
  if p.wins >= 50 then
    insert into user_medals (user_id, medal_id)
      select p_user_id, id from medals where code = 'fifty_wins'
      on conflict do nothing;
  end if;
  if p.best_streak >= 5 then
    insert into user_medals (user_id, medal_id)
      select p_user_id, id from medals where code = 'streak_5'
      on conflict do nothing;
  end if;
  if p.best_streak >= 10 then
    insert into user_medals (user_id, medal_id)
      select p_user_id, id from medals where code = 'streak_10'
      on conflict do nothing;
  end if;
  if p.rating >= 1400 then
    insert into user_medals (user_id, medal_id)
      select p_user_id, id from medals where code = 'rating_1400'
      on conflict do nothing;
  end if;
  if p.rating >= 1600 then
    insert into user_medals (user_id, medal_id)
      select p_user_id, id from medals where code = 'rating_1600'
      on conflict do nothing;
  end if;
  if p.rating >= 1800 then
    insert into user_medals (user_id, medal_id)
      select p_user_id, id from medals where code = 'rating_1800'
      on conflict do nothing;
  end if;
  if p.rating >= 2000 then
    insert into user_medals (user_id, medal_id)
      select p_user_id, id from medals where code = 'rating_2000'
      on conflict do nothing;
  end if;
  if p.rating >= 2200 then
    insert into user_medals (user_id, medal_id)
      select p_user_id, id from medals where code = 'rating_2200'
      on conflict do nothing;
  end if;
  if p.games_played >= 100 then
    insert into user_medals (user_id, medal_id)
      select p_user_id, id from medals where code = 'games_100'
      on conflict do nothing;
  end if;
end;
$$;

-- ============================================================
-- פונקציית ניהול: חסימת/ביטול חסימת משתמש (admin בלבד)
-- ============================================================
create or replace function admin_set_ban(p_target uuid, p_banned boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and is_admin) then
    raise exception 'not authorized';
  end if;
  perform set_config('app.bypass_protect', 'on', true);
  update profiles set is_banned = p_banned, banned_reason = p_reason where id = p_target;
  perform set_config('app.bypass_protect', 'off', true);
end;
$$;

-- ============================================================
-- פונקציית ניהול: ביטול משחק ע"י מנהל (ללא שינוי דירוג)
-- ============================================================
create or replace function admin_abort_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and is_admin) then
    raise exception 'not authorized';
  end if;
  update games set status = 'aborted' where id = p_game_id and status = 'active';
end;
$$;

-- ============================================================
-- אתגר משחק אישי (הזמנת שחקן ספציפי למשחק)
-- ============================================================
create table if not exists game_invites (
  id uuid primary key default uuid_generate_v4(),
  from_user uuid references profiles(id) on delete cascade,
  to_user uuid references profiles(id) on delete cascade,
  status text not null default 'pending', -- pending | accepted | declined | cancelled
  game_id uuid references games(id),
  created_at timestamptz not null default now()
);

alter table game_invites enable row level security;

drop policy if exists "invite visible to participants" on game_invites;
create policy "invite visible to participants" on game_invites for select
  using (auth.uid() = from_user or auth.uid() = to_user);

drop policy if exists "users can send invites" on game_invites;
create policy "users can send invites" on game_invites for insert
  with check (auth.uid() = from_user and from_user <> to_user);

drop policy if exists "participants can update invite" on game_invites;
create policy "participants can update invite" on game_invites for update
  using (auth.uid() = from_user or auth.uid() = to_user);

create or replace function accept_game_invite(p_invite_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inv game_invites%rowtype;
  new_game_id uuid;
  is_white boolean;
begin
  select * into inv from game_invites where id = p_invite_id for update;
  if not found then
    raise exception 'invite not found';
  end if;
  if inv.to_user <> auth.uid() then
    raise exception 'not authorized';
  end if;
  if inv.status <> 'pending' then
    raise exception 'invite already resolved';
  end if;

  is_white := random() < 0.5;
  insert into games (white_id, black_id)
  values (
    case when is_white then inv.from_user else inv.to_user end,
    case when is_white then inv.to_user else inv.from_user end
  ) returning id into new_game_id;

  update game_invites set status = 'accepted', game_id = new_game_id where id = p_invite_id;

  delete from matchmaking_queue where user_id in (inv.from_user, inv.to_user);

  return new_game_id;
end;
$$;

-- ============================================================
-- Realtime: ודא שהטבלאות משודרות בזמן אמת (בטוח להרצה חוזרת)
-- ============================================================
do $$
begin
  execute 'alter publication supabase_realtime add table games';
exception when duplicate_object then null;
end $$;

do $$
begin
  execute 'alter publication supabase_realtime add table chat_messages';
exception when duplicate_object then null;
end $$;

do $$
begin
  execute 'alter publication supabase_realtime add table matchmaking_queue';
exception when duplicate_object then null;
end $$;

do $$
begin
  execute 'alter publication supabase_realtime add table game_invites';
exception when duplicate_object then null;
end $$;

-- ============================================================
-- סיום. קובץ זה בטוח להרצה חוזרת (idempotent) - אפשר להריץ שוב בעתיד
-- בלי חשש משגיאות "already exists".
-- כדי להפוך משתמש למנהל, הרץ (עם ה-UUID של המשתמש מטבלת auth.users):
-- update profiles set is_admin = true where id = 'UUID-של-המשתמש';
-- ============================================================
