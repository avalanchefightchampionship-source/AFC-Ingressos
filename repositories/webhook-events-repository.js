import { getSupabaseAdmin } from '../lib/supabase-admin.js';

const TABLE = 'webhook_events';

export const saveWebhookEvent = async ({ eventId, eventType, payload }) => {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .insert({
      event_id: eventId,
      event_type: eventType,
      payload,
      processed: false
    })
    .select('id, processed, processing')
    .single();

  if (error?.code === '23505') {
    const { data: existing, error: lookupError } = await getSupabaseAdmin()
      .from(TABLE)
      .select('id, processed, processing')
      .eq('event_id', eventId)
      .single();

    if (lookupError) throw lookupError;
    return { duplicate: true, ...existing };
  }
  if (error) throw error;

  return { duplicate: false, ...data };
};

export const claimWebhookEvent = async (webhookEventId) => {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .update({ processing: true })
    .eq('id', webhookEventId)
    .eq('processed', false)
    .eq('processing', false)
    .select('id')
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
};

export const markWebhookEventProcessed = async (webhookEventId) => {
  const { error } = await getSupabaseAdmin()
    .from(TABLE)
    .update({ processed: true, processing: false })
    .eq('id', webhookEventId);

  if (error) throw error;
};

export const releaseWebhookEvent = async (webhookEventId) => {
  const { error } = await getSupabaseAdmin()
    .from(TABLE)
    .update({ processing: false })
    .eq('id', webhookEventId)
    .eq('processed', false);

  if (error) throw error;
};
