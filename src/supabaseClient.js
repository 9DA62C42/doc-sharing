import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.warn('缺少 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY，请检查 .env 文件');
}

export const supabase = createClient(url, anonKey);

// supabase-js 在 Edge Function 返回非 2xx 时，error.message 只有一句笼统的
// "Edge Function returned a non-2xx status code"，真正的错误文本在
// error.context 这个 Response 对象的 JSON body 里，要单独取一次。
export async function functionErrorMessage(error) {
  if (!error) return '';
  try {
    const body = await error.context.json();
    if (body?.error) return body.error;
  } catch {
    // context 不是能读 json 的 Response（比如网络层错误），退回用 error.message
  }
  return error.message;
}
