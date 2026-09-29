/** Helpers for click-to-call / WhatsApp / SMS links. */

/** Digits in international format without "+", e.g. "919876543210". Null if unusable. */
export function intlNumber(phone: string | null | undefined, countryCode = "91"): string | null {
  if (!phone) return null;
  const hasPlus = phone.trim().startsWith("+");
  let d = phone.replace(/\D/g, "");
  if (!d) return null;
  if (hasPlus) return d.length >= 8 ? d : null;
  if (d.startsWith("00")) return d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1); // trunk prefix, e.g. 09876543210
  if (d.length === 10) return `${countryCode}${d}`;
  return d.length >= 8 ? d : null;
}

export const telHref = (n: string) => `tel:+${n}`;
export const waHref = (n: string, text?: string) => `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
// "?&body=" is understood by both iOS and Android messaging apps.
export const smsHref = (n: string, text?: string) => `sms:+${n}${text ? `?&body=${encodeURIComponent(text)}` : ""}`;
export const mailHref = (email: string, subject?: string) => `mailto:${email}${subject ? `?subject=${encodeURIComponent(subject)}` : ""}`;

export type TemplateCtx = { name: string; company?: string | null; manager?: string | null; ourCompany?: string | null };

export function fillTemplate(text: string, ctx: TemplateCtx) {
  const first = ctx.name.trim().split(/\s+/)[0] ?? ctx.name;
  return text
    .replace(/\{first_name\}/g, first)
    .replace(/\{name\}/g, ctx.name)
    .replace(/\{lead_company\}/g, ctx.company || "")
    .replace(/\{manager\}/g, ctx.manager || "")
    .replace(/\{company\}/g, ctx.ourCompany || "us");
}

/** Pretty-print for display: "+91 98765 43210". */
export function displayNumber(n: string) {
  if (n.startsWith("91") && n.length === 12) return `+91 ${n.slice(2, 7)} ${n.slice(7)}`;
  return `+${n}`;
}
