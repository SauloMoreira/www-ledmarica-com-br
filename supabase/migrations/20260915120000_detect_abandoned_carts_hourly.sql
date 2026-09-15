-- Ativa a detecção automática de carrinhos abandonados.
-- A função public.detect_abandoned_carts() já existia e é usada pelo botão
-- manual do admin, mas nunca era chamada automaticamente — por isso a
-- tabela abandoned_carts nunca era populada e o e-mail de recuperação
-- (já agendado hora em hora) não tinha o que enviar.
--
-- Roda 15 min antes do job de recuperação (abandoned-cart-recovery-hourly,
-- às XX:45) para garantir que os carrinhos detectados nesta rodada já
-- estejam elegíveis (janela de 1h a 48h) quando o e-mail for disparado.
SELECT cron.schedule(
  'detect-abandoned-carts-hourly',
  '30 * * * *',
  $$SELECT public.detect_abandoned_carts(60);$$
);
