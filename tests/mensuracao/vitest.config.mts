// Testes automatizados da mensuração (Meta Pixel, Purchase, consentimento,
// integridade do pagamento). Ficam fora de src/, então não entram no build.
// Rodar (sem alterar o package.json):
//   npm i --no-save vitest@2 jsdom@25 && npx vitest run -c tests/mensuracao/vitest.config.mts
import path from "node:path";

export default {
  resolve: { alias: { "@": path.resolve(__dirname, "../../src") } },
  test: {
    environment: "jsdom",
    include: ["tests/mensuracao/**/*.test.ts"],
    root: path.resolve(__dirname, "../.."),
  },
};
