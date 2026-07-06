-- ============================================================
-- כושרמט - תוספת: אתגר משחק אישי (הזמנת שחקן ספציפי)
-- הרץ קובץ זה פעם אחת ב-SQL Editor (בנוסף ל-schema.sql שכבר הרצת)
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

-- פונקציה: קבלת אתגר -> יוצרת משחק חדש בין שני הצדדים
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

-- זמן אמת עבור הזמנות משחק
do $$
begin
  execute 'alter publication supabase_realtime add table game_invites';
exception when duplicate_object then
  null;
end $$;
