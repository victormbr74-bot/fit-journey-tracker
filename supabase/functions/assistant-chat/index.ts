import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type AssistantRequest = {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });

serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  try {
    const openAiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAiApiKey) {
      return json(500, { error: 'Missing OPENAI_API_KEY secret' });
    }

    const requestBody = (await request.json()) as AssistantRequest;

    if (!requestBody?.messages || !Array.isArray(requestBody.messages) || requestBody.messages.length === 0) {
      return json(400, { error: 'messages is required' });
    }

    const model = Deno.env.get('OPENAI_MODEL') || 'gpt-4o-mini';
    const temperature = typeof requestBody.temperature === 'number' ? requestBody.temperature : 0.7;
    const maxTokens = typeof requestBody.maxTokens === 'number' ? requestBody.maxTokens : 220;

    const openAiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openAiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: requestBody.messages,
        temperature,
        max_tokens: maxTokens,
      }),
    });

    if (!openAiResponse.ok) {
      const errorText = await openAiResponse.text();
      return json(500, {
        error: 'OpenAI request failed',
        details: errorText,
      });
    }

    const completion = await openAiResponse.json();
    const reply = completion?.choices?.[0]?.message?.content?.trim();

    if (!reply) {
      return json(500, { error: 'No reply generated' });
    }

    return json(200, { reply });
  } catch (error) {
    return json(500, {
      error: 'Unexpected error',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});
