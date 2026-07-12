// Leads captados só por telefone (LP dos Reels) recebem um e-mail sintético
// `lp_<telefone>@lead.czero.sbs` porque o modelo User exige email @unique. Não é
// um endereço real (não recebe e-mail — o contato é por WhatsApp). Exibimos de
// forma limpa no admin em vez do endereço fabricado.
const PLACEHOLDER_EMAIL_DOMAIN = "@lead.czero.sbs";

export function isPlaceholderEmail(email?: string | null): boolean {
  return !!email && email.endsWith(PLACEHOLDER_EMAIL_DOMAIN);
}

export function displayEmail(email?: string | null): string {
  if (!email) return "—";
  return isPlaceholderEmail(email) ? "sem e-mail · só telefone" : email;
}
