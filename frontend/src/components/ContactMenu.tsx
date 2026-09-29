"use client";

import { ChevronDown, Copy, Mail, MessageSquareText, Phone, PhoneCall } from "lucide-react";
import { api } from "@/lib/api";
import { displayNumber, fillTemplate, intlNumber, mailHref, smsHref, telHref, waHref } from "@/lib/contact";
import { useSession } from "@/lib/session";
import { Dropdown, MenuDivider, MenuItem, useToast } from "./ui";

export type ContactLead = {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  company?: string | null;
  assigned_to?: { name: string } | null;
};

export function WhatsAppIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35M12.05 21.5h-.01a9.4 9.4 0 0 1-4.8-1.31l-.34-.2-3.57.93.95-3.48-.22-.36a9.4 9.4 0 0 1-1.44-5.01c0-5.2 4.23-9.43 9.44-9.43a9.4 9.4 0 0 1 6.67 2.77 9.37 9.37 0 0 1 2.76 6.67c0 5.2-4.24 9.43-9.44 9.43m8.03-17.46A11.28 11.28 0 0 0 12.05.72C5.79.72.7 5.8.7 12.06c0 2 .52 3.95 1.52 5.67L.6 23.6l6.01-1.58a11.3 11.3 0 0 0 5.43 1.38h.01c6.25 0 11.34-5.09 11.35-11.34 0-3.03-1.18-5.88-3.32-8.02" />
    </svg>
  );
}

/** Logs a touchpoint on the lead's timeline without blocking the navigation to tel:/wa.me. */
function useContactActions(lead: ContactLead) {
  const { meta, me } = useSession();
  const toast = useToast();
  const cc = meta?.messaging.country_code || "91";
  const num = intlNumber(lead.phone, cc);
  const templates = meta?.messaging.templates ?? [];
  const ctx = { name: lead.name, company: lead.company, manager: me?.name ?? lead.assigned_to?.name, ourCompany: meta?.company.name };

  const log = (channel: string, summary: string) => {
    api(`/api/leads/${lead.id}/contact`, { method: "POST", json: { channel, summary } }).catch(() => {});
  };
  const copy = (text: string, what: string) => {
    navigator.clipboard?.writeText(text).then(() => toast(`${what} copied`), () => toast(text, "info"));
  };
  return { num, templates, ctx, log, copy };
}

/**
 * Contact dropdown for a lead: call, WhatsApp (chat + templates), SMS, email, copy.
 * `variant` controls the trigger: a compact icon for lists/cards or a full button.
 */
export function ContactMenu({
  lead,
  variant = "icon",
  align = "right",
  onContacted,
}: {
  lead: ContactLead;
  variant?: "icon" | "button";
  align?: "left" | "right";
  onContacted?: () => void;
}) {
  const { num, templates, ctx, log, copy } = useContactActions(lead);
  const done = (channel: string, summary: string) => {
    log(channel, summary);
    setTimeout(() => onContacted?.(), 600);
  };
  const noContact = !num && !lead.email;

  return (
    <Dropdown
      align={align}
      width={288}
      title={`Contact ${lead.name}`}
      trigger={({ toggle, open }) =>
        variant === "icon" ? (
          <button
            type="button"
            onClick={toggle}
            disabled={noContact}
            aria-label={`Contact ${lead.name}`}
            className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition disabled:opacity-30 ${
              open ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-500 hover:border-emerald-400 hover:text-emerald-600"
            }`}
          >
            <PhoneCall className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button type="button" onClick={toggle} disabled={noContact} className="btn-secondary">
            <PhoneCall className="h-4 w-4" /> Contact <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          </button>
        )
      }
    >
      {(close) => {
        const act = (channel: string, summary: string) => () => {
          done(channel, summary);
          close();
        };
        return (
          <div>
            <MenuItem icon={<Phone className="h-4 w-4 text-sky-600" />} href={num ? telHref(num) : undefined} disabled={!num} hint={num ? displayNumber(num) : "No phone number"} onClick={act("call", "Call started from CRM")}>
              Call
            </MenuItem>
            <MenuItem icon={<WhatsAppIcon className="h-4 w-4 text-emerald-600" />} href={num ? waHref(num) : undefined} external disabled={!num} hint="Open chat" onClick={act("whatsapp", "WhatsApp chat opened from CRM")}>
              WhatsApp
            </MenuItem>
            {num && templates.length > 0 && (
              <>
                <p className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">WhatsApp message</p>
                {templates.map((t) => {
                  const text = fillTemplate(t.text, ctx);
                  return (
                    <MenuItem key={t.name} icon={<WhatsAppIcon className="h-3.5 w-3.5 text-emerald-500" />} href={waHref(num, text)} external hint={text} onClick={act("whatsapp", `Sent “${t.name}” on WhatsApp`)}>
                      {t.name}
                    </MenuItem>
                  );
                })}
              </>
            )}
            <MenuDivider />
            <MenuItem
              icon={<MessageSquareText className="h-4 w-4 text-violet-600" />}
              href={num ? smsHref(num, templates[0] ? fillTemplate(templates[0].text, ctx) : undefined) : undefined}
              disabled={!num}
              hint="Text message"
              onClick={act("sms", "SMS opened from CRM")}
            >
              SMS
            </MenuItem>
            <MenuItem icon={<Mail className="h-4 w-4 text-amber-600" />} href={lead.email ? mailHref(lead.email, `Regarding your enquiry`) : undefined} disabled={!lead.email} hint={lead.email ?? "No email"} onClick={act("email", "Email opened from CRM")}>
              Email
            </MenuItem>
            {(num || lead.email) && <MenuDivider />}
            {num && (
              <MenuItem
                icon={<Copy className="h-4 w-4 text-slate-400" />}
                onClick={() => {
                  copy(`+${num}`, "Phone number");
                  close();
                }}
              >
                Copy phone number
              </MenuItem>
            )}
            {lead.email && (
              <MenuItem
                icon={<Copy className="h-4 w-4 text-slate-400" />}
                onClick={() => {
                  copy(lead.email!, "Email");
                  close();
                }}
              >
                Copy email
              </MenuItem>
            )}
          </div>
        );
      }}
    </Dropdown>
  );
}

/** Prominent Call + WhatsApp CTAs (lead page header and mobile action bar). */
export function QuickContact({ lead, onContacted, compact }: { lead: ContactLead; onContacted?: () => void; compact?: boolean }) {
  const { num, templates, ctx, log } = useContactActions(lead);
  const after = (channel: string, summary: string) => {
    log(channel, summary);
    setTimeout(() => onContacted?.(), 600);
  };
  const size = compact ? "flex-1 justify-center" : "";
  return (
    <>
      <a
        href={num ? telHref(num) : undefined}
        aria-disabled={!num}
        onClick={() => num && after("call", "Call started from CRM")}
        className={`btn bg-sky-600 text-white hover:bg-sky-700 aria-disabled:pointer-events-none aria-disabled:opacity-40 ${size}`}
      >
        <Phone className="h-4 w-4" /> Call
      </a>
      <Dropdown
        align="right"
        width={300}
        title="WhatsApp"
        trigger={({ toggle }) => (
          <button type="button" onClick={toggle} disabled={!num} className={`btn bg-emerald-600 text-white hover:bg-emerald-700 ${size}`}>
            <WhatsAppIcon /> WhatsApp <ChevronDown className="h-3.5 w-3.5 opacity-80" />
          </button>
        )}
      >
        {(close) =>
          num && (
            <div>
              <MenuItem
                icon={<WhatsAppIcon className="h-4 w-4 text-emerald-600" />}
                href={waHref(num)}
                external
                hint={displayNumber(num)}
                onClick={() => {
                  after("whatsapp", "WhatsApp chat opened from CRM");
                  close();
                }}
              >
                Open chat
              </MenuItem>
              {templates.length > 0 && <MenuDivider />}
              {templates.map((t) => {
                const text = fillTemplate(t.text, ctx);
                return (
                  <MenuItem
                    key={t.name}
                    icon={<MessageSquareText className="h-4 w-4 text-emerald-500" />}
                    href={waHref(num, text)}
                    external
                    hint={text}
                    onClick={() => {
                      after("whatsapp", `Sent “${t.name}” on WhatsApp`);
                      close();
                    }}
                  >
                    {t.name}
                  </MenuItem>
                );
              })}
            </div>
          )
        }
      </Dropdown>
    </>
  );
}
