const API = 'https://api.telegram.org/bot';
const WELCOME = 'سلام من ربات ناشناس امین هستم و به صورت ناشناس پیامتون رو به امین میرسونم 🖤🥃\n\nامین نام، نام کاربری و شناسه عددی شما را می‌بیند. پیام خود را بفرستید.';

async function telegram(env, method, body) {
  const response = await fetch(`${API}${env.BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(`Telegram ${method}: ${result.description || response.status}`);
  return result.result;
}

async function handleMessage(message, env) {
  // Only private chats are supported; ignore channel posts and group messages.
  if (!message?.from || message.chat?.type !== 'private') return;
  const adminId = String(env.ADMIN_ID);
  const senderId = String(message.from.id);
  if (senderId === adminId) {
    if (message.text === '/start') {
      await telegram(env, 'sendMessage', { chat_id: adminId, text: 'برای پاسخ دادن، روی پیام کاربر در همین گفتگو ریپلای کنید.' });
      return;
    }
    const repliedId = message.reply_to_message?.message_id;
    const recipient = repliedId && await env.CONVERSATIONS.get(`admin:${repliedId}`);
    if (!recipient) {
      await telegram(env, 'sendMessage', { chat_id: adminId, text: 'برای پاسخ، روی پیام یا مشخصات کاربر ریپلای کنید.' });
      return;
    }
    try {
      await telegram(env, 'copyMessage', { chat_id: recipient, from_chat_id: adminId, message_id: message.message_id });
    } catch (error) {
      console.error('Could not deliver admin reply:', error.message);
      await telegram(env, 'sendMessage', { chat_id: adminId, text: 'ارسال پاسخ انجام نشد؛ ممکن است کاربر ربات را مسدود کرده باشد یا این نوع پیام پشتیبانی نشود.' });
    }
    return;
  }
  if (message.text?.split(' ')[0] === '/start') {
    await telegram(env, 'sendMessage', { chat_id: senderId, text: WELCOME });
    return;
  }
  const name = [message.from.first_name, message.from.last_name].filter(Boolean).join(' ') || 'نامشخص';
  const username = message.from.username ? `@${message.from.username}` : 'ندارد';
  const info = await telegram(env, 'sendMessage', {
    chat_id: adminId,
    text: `پیام جدید\nنام: ${name}\nنام کاربری: ${username}\nشناسه عددی: ${senderId}\n\nبرای پاسخ، روی این پیام یا پیام بعدی ریپلای کنید.`,
  });
  await env.CONVERSATIONS.put(`admin:${info.message_id}`, senderId);
  try {
    const copied = await telegram(env, 'copyMessage', { chat_id: adminId, from_chat_id: senderId, message_id: message.message_id });
    await env.CONVERSATIONS.put(`admin:${copied.message_id}`, senderId);
  } catch (error) {
    console.error('Could not copy user message:', error.message);
    await telegram(env, 'sendMessage', { chat_id: senderId, text: 'متأسفانه ارسال این نوع پیام ممکن نبود. لطفاً متن یا رسانه دیگری بفرستید.' });
  }
}

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') return new Response('Amin anonymous chat bot', { status: 200 });
    if (!env.BOT_TOKEN || !env.ADMIN_ID || !env.WEBHOOK_SECRET || !env.CONVERSATIONS) return new Response('Bot is not configured', { status: 503 });
    if (request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.WEBHOOK_SECRET) return new Response('Unauthorized', { status: 401 });
    try {
      const update = await request.json();
      await handleMessage(update.message, env);
      return new Response('OK');
    } catch (error) {
      // Do not log the bot token or full request.
      console.error('Failed to process Telegram update');
      return new Response('Update failed', { status: 500 });
    }
  },
};
