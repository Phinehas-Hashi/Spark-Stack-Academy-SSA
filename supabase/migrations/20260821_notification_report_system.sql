-- ============================================================
-- SSA NOTIFICATION + REPORT PLATFORM
-- Firebase Auth identity + Supabase backend
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_firebase_uid text,
  audience text not null default 'user' check (audience in ('user','role','course','all')),
  recipient_role text,
  course_id text,
  type text not null default 'general',
  title text not null,
  message text not null,
  priority text not null default 'normal' check (priority in ('low','normal','high','critical')),
  read_at timestamptz,
  action_url text,
  metadata jsonb not null default '{}'::jsonb,
  dedupe_key text,
  created_at timestamptz not null default now()
);

create unique index if not exists notifications_dedupe_key_idx
  on public.notifications(dedupe_key)
  where dedupe_key is not null;

create index if not exists notifications_recipient_idx
  on public.notifications(recipient_firebase_uid, created_at desc);

create index if not exists notifications_role_idx
  on public.notifications(recipient_role, created_at desc)
  where recipient_role is not null;

create index if not exists notifications_course_idx
  on public.notifications(course_id, created_at desc)
  where course_id is not null;

create index if not exists notifications_unread_idx
  on public.notifications(recipient_firebase_uid, read_at, created_at desc);

create table if not exists public.notification_preferences (
  firebase_uid text primary key,
  enabled boolean not null default true,
  sound_enabled boolean not null default true,
  quiet_hours_enabled boolean not null default false,
  quiet_start time,
  quiet_end time,
  updated_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  report_code text not null unique,
  reporter_firebase_uid text not null,
  reporter_role text not null,
  category text not null default 'general',
  priority text not null default 'medium' check (priority in ('low','medium','high','critical')),
  title text not null,
  description text not null,
  status text not null default 'pending' check (status in ('pending','reviewing','resolved','dismissed','closed')),
  assigned_to uuid,
  resolution text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists reports_reporter_idx
  on public.reports(reporter_firebase_uid, created_at desc);

create index if not exists reports_status_idx
  on public.reports(status, created_at desc);

create table if not exists public.report_messages (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  sender_firebase_uid text not null,
  sender_role text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists report_messages_report_idx
  on public.report_messages(report_id, created_at asc);

-- Updated-at helpers.
create or replace function public.touch_notification_preferences()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists notification_preferences_touch on public.notification_preferences;
create trigger notification_preferences_touch
before update on public.notification_preferences
for each row execute function public.touch_notification_preferences();

create or replace function public.touch_report()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists reports_touch on public.reports;
create trigger reports_touch
before update on public.reports
for each row execute function public.touch_report();

-- Payment -> notification trigger. This is intentionally idempotent.
create or replace function public.notify_payment_success()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  payment_key text;
  course_label text;
  amount_label text;
begin
  if new.status = 'success'
     and (tg_op = 'INSERT' or old.status is distinct from 'success')
     and new.user_id is not null then

    payment_key := 'payment:' || new.id::text || ':success';
    course_label := coalesce(nullif(new.course_name, ''), 'your course');
    amount_label := 'KSh ' || to_char(coalesce(new.amount, 0), 'FM999G999G999D00');

    insert into public.notifications (
      recipient_firebase_uid,
      audience,
      type,
      title,
      message,
      priority,
      action_url,
      metadata,
      dedupe_key
    ) values (
      new.user_id,
      'user',
      'payment_success',
      'Payment successful',
      'Your payment of ' || amount_label || ' for ' || course_label || ' was received successfully.',
      'high',
      case when new.course_id is null then '/student/payments.html' else '/student/course-details.html?id=' || new.course_id end,
      jsonb_build_object(
        'payment_id', new.id,
        'reference', new.reference,
        'course_id', new.course_id,
        'course_name', new.course_name,
        'amount', new.amount,
        'currency', new.currency,
        'provider', new.provider
      ),
      payment_key
    ) on conflict (dedupe_key) do nothing;

    insert into public.notifications (
      audience,
      recipient_role,
      type,
      title,
      message,
      priority,
      metadata,
      dedupe_key
    ) values (
      'role',
      'admin',
      'payment_success',
      'New course payment',
      course_label || ' received a successful payment of ' || amount_label || '.',
      'normal',
      jsonb_build_object('payment_id', new.id, 'user_id', new.user_id, 'course_id', new.course_id, 'course_name', new.course_name),
      payment_key || ':admin'
    ) on conflict (dedupe_key) do nothing;

    insert into public.notifications (
      audience,
      recipient_role,
      type,
      title,
      message,
      priority,
      metadata,
      dedupe_key
    ) values (
      'role',
      'founder',
      'payment_success',
      'New course payment',
      course_label || ' received a successful payment of ' || amount_label || '.',
      'normal',
      jsonb_build_object('payment_id', new.id, 'user_id', new.user_id, 'course_id', new.course_id, 'course_name', new.course_name),
      payment_key || ':founder'
    ) on conflict (dedupe_key) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists payments_notify_success on public.payments;
create trigger payments_notify_success
after insert or update of status on public.payments
for each row execute function public.notify_payment_success();

-- Supabase Realtime publication. Safe when already configured.
do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

-- These tables are intentionally service-role managed. Firebase-authenticated
-- clients must go through the Edge Function, because Supabase Auth is not the
-- identity provider for SSA users.
alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.reports enable row level security;
alter table public.report_messages enable row level security;

comment on table public.notifications is 'Central SSA notifications; Firebase UID is the user identity.';
comment on table public.reports is 'Student/instructor reports handled by admin/founder.';
comment on table public.report_messages is 'Conversation and feedback thread for an SSA report.';
