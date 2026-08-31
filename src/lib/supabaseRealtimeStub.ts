/**
 * Stub de `@supabase/realtime-js`.
 *
 * O projeto não usa Realtime em nenhum ponto (loja pública nem admin):
 * não há `.channel(`, `.on('postgres_changes'` ou `supabase.realtime` no código.
 * O `@supabase/supabase-js` importa o RealtimeClient de forma estática, o que
 * arrastava ~53 KB (min) de código de websocket/phoenix para o bundle inicial.
 *
 * Este stub é aplicado via `resolve.alias` no vite.config.ts. Caso alguma
 * feature futura precise de Realtime, basta remover o alias.
 */

export class RealtimeClient {
  accessToken: string | null = null;
  channels: unknown[] = [];

  constructor(
    public endPoint?: string,
    public options?: unknown,
  ) {}

  setAuth(token?: string | null) {
    this.accessToken = token ?? null;
  }

  connect() {}
  disconnect() {}
  getChannels() {
    return [];
  }
  removeChannel() {
    return Promise.resolve("ok" as const);
  }
  removeAllChannels() {
    return Promise.resolve([] as const);
  }
  channel(): never {
    throw new Error(
      "Supabase Realtime está desabilitado neste projeto (stub em src/lib/supabaseRealtimeStub.ts).",
    );
  }
}

export default RealtimeClient;
