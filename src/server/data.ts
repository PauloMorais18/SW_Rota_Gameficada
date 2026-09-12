import { getAppData } from '../lib/data.js';
export async function GET() {
  try { return Response.json(await getAppData(), { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNKNOWN';
    console.error('Falha ao carregar dados da aplicação:', code);
    const schemaPending = code === 'P2021' || code === 'P2022';
    return Response.json({ error: process.env.NODE_ENV !== 'production' && schemaPending
      ? 'O banco está conectado, mas faltam atualizações de estrutura. Aplique a migration incremental indicada no README.'
      : 'Não foi possível carregar os dados. Verifique a conexão com o banco.' }, { status: 503 });
  }
}
