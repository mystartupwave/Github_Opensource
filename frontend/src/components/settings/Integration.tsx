"use client";

import { useState } from "react";
import { Check, Copy, Eye, EyeOff, RefreshCw } from "lucide-react";
import { API_URL, api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { ConfirmModal, Field, Tabs, Toggle, useToast } from "@/components/ui";

export type IntegrationCfg = { api_key: string; enabled: boolean; default_source_key: string };

function CopyBlock({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      {label && <p className="label">{label}</p>}
      <pre className="overflow-x-auto rounded-lg bg-slate-900 p-4 pr-12 text-xs leading-relaxed text-slate-100">{text}</pre>
      <button
        className="absolute right-2 bottom-2 rounded-md bg-slate-700 p-1.5 text-slate-200 hover:bg-slate-600"
        onClick={() => {
          navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        aria-label="Copy"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

export function IntegrationSettings({ initial }: { initial: IntegrationCfg }) {
  const { meta } = useSession();
  const toast = useToast();
  const [cfg, setCfg] = useState(initial);
  const [show, setShow] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [tab, setTab] = useState<"curl" | "js" | "html" | "php">("js");
  if (!meta) return null;
  const endpoint = `${API_URL}/api/leads`;
  const key = cfg.api_key;
  const fieldKeys = meta.custom_fields.filter((f) => f.is_active);

  async function update(patch: Partial<IntegrationCfg>) {
    try {
      const r = await api<IntegrationCfg>("/api/settings/integration", { method: "PATCH", json: patch });
      setCfg(r);
      toast("Saved");
    } catch (e: any) {
      toast(e.message, "error");
    }
  }

  const sampleBody = {
    name: "Rahul Sharma",
    phone: "9876543210",
    email: "rahul@gmail.com",
    source: "website",
    message: "Interested in your service",
    ...(fieldKeys[0] ? { [fieldKeys[0].key]: fieldKeys[0].options[0] ?? "value" } : {}),
  };
  const snippets = {
    curl: `curl -X POST ${endpoint} \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: ${key}" \\
  -d '${JSON.stringify(sampleBody)}'`,
    js: `await fetch("${endpoint}", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": "${key}",
  },
  body: JSON.stringify(${JSON.stringify(sampleBody, null, 2).replace(/\n/g, "\n  ")}),
});`,
    html: `<!-- Plain HTML form: no JavaScript needed -->
<form method="POST" action="${API_URL}/api/public/leads?api_key=${key}">
  <input name="name" placeholder="Your name" required />
  <input name="phone" placeholder="Phone" />
  <input name="email" type="email" placeholder="Email" />
  <textarea name="message" placeholder="How can we help?"></textarea>
  <input type="hidden" name="source" value="website" />
  <input type="hidden" name="_redirect" value="https://yoursite.com/thank-you" />
  <button type="submit">Send enquiry</button>
</form>`,
    php: `$ch = curl_init("${endpoint}");
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER => ["Content-Type: application/json", "X-API-Key: ${key}"],
  CURLOPT_POSTFIELDS => json_encode([
    "name" => $_POST["name"], "phone" => $_POST["phone"],
    "email" => $_POST["email"], "message" => $_POST["message"], "source" => "website",
  ]),
]);
curl_exec($ch);`,
  };

  return (
    <div className="space-y-6">
      <section className="card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold">Website form &amp; API intake</h2>
            <p className="text-sm text-slate-500">Leads sent here are created automatically with status “New” and assigned according to your assignment settings.</p>
          </div>
          <Toggle checked={cfg.enabled} onChange={(v) => update({ enabled: v })} />
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="Endpoint">
            <div className="input bg-slate-50 font-mono text-xs">POST {endpoint}</div>
          </Field>
          <Field label="API key" hint="Send as the X-API-Key header (or ?api_key= for plain HTML forms).">
            <div className="flex gap-2">
              <input className="input font-mono text-xs" readOnly value={show ? key : key.replace(/.(?=.{4})/g, "•")} />
              <button className="btn-secondary" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide key" : "Show key"}>
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              <button
                className="btn-secondary"
                onClick={() => {
                  navigator.clipboard.writeText(key);
                  toast("API key copied");
                }}
                aria-label="Copy key"
              >
                <Copy className="h-4 w-4" />
              </button>
              <button className="btn-secondary" onClick={() => setConfirm(true)} aria-label="Regenerate key">
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </Field>
          <Field label="Default source" hint="Used when a submission doesn't include a source.">
            <select className="input" value={cfg.default_source_key} onChange={(e) => update({ default_source_key: e.target.value })}>
              {meta.sources.map((s) => (
                <option key={s.id} value={s.key}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="mb-4 font-semibold">Code snippets</h2>
        <Tabs
          tabs={[
            { key: "js", label: "JavaScript" },
            { key: "html", label: "HTML form" },
            { key: "curl", label: "cURL" },
            { key: "php", label: "PHP" },
          ]}
          value={tab}
          onChange={setTab}
        />
        <CopyBlock text={snippets[tab]} />
        <div className="mt-5 grid gap-6 text-sm md:grid-cols-2">
          <div>
            <p className="mb-2 font-medium">Accepted fields</p>
            <ul className="space-y-1 text-slate-600">
              <li>
                <code>name</code> <span className="text-red-500">*</span> — also <code>full_name</code>
              </li>
              <li>
                <code>phone</code> or <code>email</code> <span className="text-red-500">*</span> (at least one) — also <code>mobile</code>
              </li>
              <li>
                <code>company</code>, <code>message</code>, <code>priority</code> (High/Medium/Low)
              </li>
              <li>
                <code>source</code> — a source key or name; unknown sources are created. Also <code>utm_source</code>
              </li>
              <li>
                <code>tags</code> — list or comma-separated names
              </li>
            </ul>
          </div>
          <div>
            <p className="mb-2 font-medium">Your custom fields</p>
            {fieldKeys.length ? (
              <ul className="space-y-1 text-slate-600">
                {fieldKeys.map((f) => (
                  <li key={f.id}>
                    <code>{f.key}</code> — {f.name}
                    {f.options.length > 0 && <span className="text-slate-400"> ({f.options.join(" / ")})</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-slate-400">None yet.</p>
            )}
            <p className="mt-3 text-xs text-slate-500">
              Response: <code>{`{"ok": true, "lead_id": 42, "code": "LD-10042", "duplicate": false, "assigned_to": "Amit"}`}</code>. If the phone/email already exists, the existing lead is updated and{" "}
              <code>duplicate</code> is <code>true</code>.
            </p>
          </div>
        </div>
      </section>

      <ConfirmModal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Regenerate API key?"
        message="Your website will stop sending leads until you update it with the new key."
        confirmLabel="Regenerate"
        onConfirm={async () => {
          const r = await api<{ api_key: string }>("/api/settings/integration/regenerate-key", { method: "POST" });
          setCfg({ ...cfg, api_key: r.api_key });
          setShow(true);
          setConfirm(false);
          toast("New API key generated");
        }}
      />
    </div>
  );
}
