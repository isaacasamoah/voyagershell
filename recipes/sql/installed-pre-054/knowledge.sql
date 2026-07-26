SET search_path = public, extensions;

CREATE TABLE public.knowledge_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_num bigserial,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  voyage_slug text,
  event_type text NOT NULL DEFAULT 'message',
  content text,
  metadata jsonb DEFAULT '{}'::jsonb,
  source_type text,
  source_ref jsonb,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_type text NOT NULL DEFAULT 'pipeline',
  participants uuid[],
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.knowledge_current (
  event_id uuid PRIMARY KEY REFERENCES public.knowledge_events(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  voyage_slug text,
  content text NOT NULL DEFAULT '',
  classifications text[] DEFAULT '{}'::text[],
  entities text[] DEFAULT '{}'::text[],
  topics text[] DEFAULT '{}'::text[],
  embedding vector(1536),
  source_created_at timestamptz NOT NULL DEFAULT now(),
  participants uuid[],
  event_type text,
  knowledge_type text,
  attention_score real DEFAULT 0.5,
  base_attention double precision,
  context_snippet text,
  sender_display_name text,
  sender_user_id uuid,
  addressed_to uuid[],
  session_id text,
  promotion_count integer DEFAULT 0,
  superseded_by uuid,
  search_vector tsvector,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.knowledge_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.knowledge_events(id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES public.knowledge_events(id) ON DELETE CASCADE,
  edge_type text NOT NULL CHECK (edge_type IN (
    'supersedes', 'supports', 'contradicts', 'elaborates',
    'triggered_by', 'relates_to', 'decided_by', 'raised_by'
  )),
  created_by text NOT NULL DEFAULT 'cartographer',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, target_id, edge_type)
);
CREATE TABLE public.private_reply_promotions (
  source_event_id uuid NOT NULL
    REFERENCES public.knowledge_events(id) ON DELETE RESTRICT,
  sharer_user_id uuid NOT NULL
    REFERENCES public.profiles(id) ON DELETE CASCADE,
  destination_space_id uuid NOT NULL
    REFERENCES public.spaces(id) ON DELETE CASCADE,
  shared_event_id uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_event_id, sharer_user_id, destination_space_id),
  CONSTRAINT private_reply_promotions_shared_event_fkey
    FOREIGN KEY (shared_event_id)
    REFERENCES public.knowledge_events(id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE public.message_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.knowledge_events(id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delivered_at timestamptz,
  seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, recipient_user_id)
);

CREATE FUNCTION public.apply_knowledge_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  event_classifications text[];
  event_entities text[];
  event_topics text[];
  event_addressed_to uuid[];
BEGIN
  IF NEW.event_type IN (
    'conversation', 'message', 'document', 'slack_message', 'jira_update', 'explicit'
  ) THEN
    SELECT coalesce(array_agg(value), '{}'::text[])
      INTO event_classifications
      FROM jsonb_array_elements_text(coalesce(NEW.metadata->'classifications', '[]')) value;
    SELECT coalesce(array_agg(value), '{}'::text[])
      INTO event_entities
      FROM jsonb_array_elements_text(coalesce(NEW.metadata->'entities', '[]')) value;
    SELECT coalesce(array_agg(value), '{}'::text[])
      INTO event_topics
      FROM jsonb_array_elements_text(coalesce(NEW.metadata->'topics', '[]')) value;
    SELECT array_agg(value::uuid) INTO event_addressed_to
      FROM jsonb_array_elements_text(coalesce(NEW.metadata->'addressed_to', '[]')) value;
    INSERT INTO public.knowledge_current(
      event_id, user_id, voyage_slug, content, classifications, entities, topics,
      participants, session_id, event_type, sender_display_name, sender_user_id,
      addressed_to, source_created_at
    ) VALUES (
      NEW.id, NEW.user_id, NEW.voyage_slug, NEW.content,
      event_classifications, event_entities, event_topics, NEW.participants,
      NEW.metadata->>'session_id', NEW.event_type,
      NEW.metadata->>'sender_display_name',
      nullif(NEW.metadata->>'sender_user_id', '')::uuid,
      event_addressed_to, NEW.created_at
    );
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER on_knowledge_event_insert AFTER INSERT ON public.knowledge_events
  FOR EACH ROW EXECUTE FUNCTION public.apply_knowledge_event();

CREATE FUNCTION public.update_search_vector() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  NEW.search_vector := to_tsvector(
    'english', coalesce(NEW.context_snippet, '') || ' ' || coalesce(NEW.content, '')
  );
  RETURN NEW;
END
$$;
CREATE TRIGGER trg_update_search_vector
  BEFORE INSERT OR UPDATE OF content, context_snippet ON public.knowledge_current
  FOR EACH ROW EXECUTE FUNCTION public.update_search_vector();

GRANT INSERT ON public.knowledge_edges TO authenticated;
